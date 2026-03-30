import re

path = "c:/Users/automated8/Documents/siddhubhiaya_2/MT Data Feed API_V1.pdf"
try:
    with open(path, "rb") as f:
        content = f.read()
        # Find printable strings of length 4+
        strings = re.findall(b"[a-zA-Z0-9\"{:}_.,\\- ]{10,}", content)
        for s in strings:
            try:
                decoded = s.decode('ascii')
                # Filter for things that look like JSON keys or API keywords
                if any(k in decoded for k in ["type", "Login", "subscribe", "json", "Request"]):
                    print(decoded)
            except:
                pass
except Exception as e:
    print(f"Error: {e}")
