Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\Users\admin\Documents\Github\excalidraw\excalidraw-app && http-server build -a localhost -p 6969 -c-1", 0, False
