"""Open the local Mac workspace after verifying this service is responding."""
import json
import os
import threading
import time
import urllib.request
import webbrowser
import server

def is_running(url):
    try:
        with urllib.request.urlopen(url+"/api/status",timeout=.6) as response:
            status = json.load(response)
        return isinstance(status,dict) and "defaultProvider" in status and "parser" in status
    except (ValueError, OSError):
        return False


def open_when_ready(url):
    for _ in range(60):
        if is_running(url):
            webbrowser.open(url)
            return
        time.sleep(.25)

if __name__=="__main__":
    address="http://127.0.0.1:"+os.environ.get("COMMENT_PORT","8766")
    if is_running(address):
        webbrowser.open(address)
        raise SystemExit(0)
    threading.Thread(target=open_when_ready,args=(address,),daemon=True).start()
    server.main()
