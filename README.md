# IPO Dashboard (local)

A small HTML/CSS/JavaScript IPO dashboard using the IPO Guru endpoint:

`https://www.ipoguru.in/api/v2/ipos`

The API key is kept on the local Node.js server and is **not** sent to the browser. The browser calls the local `/api/ipos` proxy.

## Requirements

- Node.js 18 or newer
- Your IPO Guru API key

## Setup (Windows)

1. Install Node.js 18+ from https://nodejs.org/ if it is not already installed.
2. Extract this ZIP into a folder, for example `C:\ipo-dashboard`.
3. In that folder, make a copy of `.env.example` and name the copy `.env`.
   - In File Explorer, enable **View > Show > File name extensions** so the file is named exactly `.env`, not `.env.txt`.
4. Open `.env` in Notepad and replace `PASTE_YOUR_REAL_API_KEY_HERE` with your real key:
   `IPOGURU_API_KEY=your_real_key_here`
5. Save `.env`.
6. Open Command Prompt or PowerShell in the project folder.
   - In File Explorer, open the folder, click the address bar, type `cmd`, and press Enter.
7. Run:
   `node server.js`
8. Open this address in your browser:
   `http://localhost:3000`

Click **Refresh** in the dashboard to fetch the latest API data.

## Important

- Do not paste your API key into `app.js`, `index.html`, a screenshot, or a public GitHub repository.
- Do not share your `.env` file.
- If you see `API key not configured`, check the `.env` filename and key value, then stop and restart `node server.js`.
- If you see `401 Unauthorized`, confirm that the key is correct and active.
- If the API returns data but the table is empty or fields are mismatched, the exact successful Postman JSON response is needed to map the API's actual schema. The dashboard currently uses flexible field matching, but the provider's response format has not yet been verified.
- This project does not invent GMP or subscription values. It displays them only if the API response includes those fields.

## Deploy later

For deployment, use a host that supports a server-side Node.js process (not static-only hosting), configure `IPOGURU_API_KEY` as a server environment variable, and deploy the project. Never put the key in frontend JavaScript.
