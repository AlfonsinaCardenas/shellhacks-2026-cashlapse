import os
from dotenv import load_dotenv
from google import genai

load_dotenv()  # reads your .env file

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

interaction = client.interactions.create(
    model="gemini-3.8-flash",
    input="Hello!"
)
print(interaction.output_text)