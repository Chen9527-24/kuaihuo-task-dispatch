"""Isolated worker for the pinned Vosk C library and Mandarin model."""
import ctypes
import json
import os
from pathlib import Path
import re
import sys


def load_library(home):
    lib = ctypes.CDLL(str(home / "engine/vosk/libvosk.so"))
    ptr, cstr, integer = ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int
    signatures = {
        "vosk_model_new": (ptr, [cstr]),
        "vosk_model_free": (None, [ptr]),
        "vosk_recognizer_new": (ptr, [ptr, ctypes.c_float]),
        "vosk_recognizer_free": (None, [ptr]),
        "vosk_recognizer_set_words": (None, [ptr, integer]),
        "vosk_recognizer_accept_waveform": (integer, [ptr, cstr, integer]),
        "vosk_recognizer_result": (cstr, [ptr]),
        "vosk_recognizer_final_result": (cstr, [ptr]),
        "vosk_set_log_level": (None, [integer]),
    }
    for name, (returns, arguments) in signatures.items():
        function = getattr(lib, name)
        function.restype = returns
        function.argtypes = arguments
    lib.vosk_set_log_level(-1)
    return lib


def collect(pieces, result):
    words = json.loads(result).get("result") or []
    if words:
        text = " ".join(item["word"] for item in words)
        text = re.sub(r"(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])", "", text)
        pieces.append({"start": words[0]["start"], "end": words[-1]["end"], "text": text})


def recognize(home, audio):
    lib = load_library(home)
    model = lib.vosk_model_new(os.fsencode(home / "vosk-model-small-cn-0.22"))
    if not model:
        raise RuntimeError("无法载入中文语音模型")
    recognizer = None
    pieces = []
    try:
        recognizer = lib.vosk_recognizer_new(model, 16000.0)
        if not recognizer:
            raise RuntimeError("无法创建中文语音识别器")
        lib.vosk_recognizer_set_words(recognizer, 1)
        while chunk := audio.read(8000):
            step = lib.vosk_recognizer_accept_waveform(recognizer, chunk, len(chunk))
            if step < 0:
                raise RuntimeError("语音解码失败")
            if step == 1:
                collect(pieces, lib.vosk_recognizer_result(recognizer))
        collect(pieces, lib.vosk_recognizer_final_result(recognizer))
        return pieces
    finally:
        if recognizer:
            lib.vosk_recognizer_free(recognizer)
        lib.vosk_model_free(model)


if __name__ == "__main__":
    home, audio = sys.argv[1:3]
    with open(audio, "rb") as stream:
        print(json.dumps(recognize(Path(home), stream), ensure_ascii=False))
