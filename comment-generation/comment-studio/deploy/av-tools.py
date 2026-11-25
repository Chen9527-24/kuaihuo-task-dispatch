"""Read validated short-video formats and emit bounded mono PCM using FFmpeg via PyAV."""
import json
import sys

import av

def process(mode, path, args):
    opts = {"protocol_whitelist":"file,pipe", "format_whitelist":"mov,matroska,webm,avi,flv"}
    with av.open(path, options=opts) as clip:
        if mode == "probe":
            streams = [{"codec_type": s.type, "duration": float(s.duration*s.time_base) if s.duration is not None and s.time_base else None} for s in clip.streams]
            print(json.dumps({"streams":streams, "format":{"duration":clip.duration/av.time_base if clip.duration else None}}))
            return
        output, limit = args
        maximum = int(limit) * 16000 * 2
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        with open(output,"wb") as dest:
            def write(frame):
                for out in resampler.resample(frame):
                    raw = bytes(out.planes[0])[:out.samples*2]
                    budget = maximum-dest.tell()
                    dest.write(raw[:budget])
            for frame in clip.decode(audio=0):
                write(frame)
                if dest.tell() >= maximum:
                    break
            write(None)

if __name__ == "__main__":
    process(sys.argv[1],sys.argv[2],sys.argv[3:])
