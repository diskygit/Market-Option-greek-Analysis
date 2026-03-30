import sys
try:
    from pypdf import PdfReader
except ImportError:
    try:
        import PyPDF2 as PdfReader
    except ImportError:
        print("MISSING_LIB")
        sys.exit(0)

try:
    reader = PdfReader("c:/Users/automated8/Documents/siddhubhiaya_2/MT Data Feed API_V1.pdf")
    text = ""
    for page in reader.pages:
        text += page.extract_text() + "\n"
    print(text)
except Exception as e:
    print(f"ERROR: {e}")
