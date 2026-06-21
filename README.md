# Underscore Human Eval App

<img width="460" height="659" alt="image" src="https://github.com/user-attachments/assets/42b7325e-92f8-4706-a8b7-3424f6319ea3" />


## Structure

```text
app/
  __init__.py
  server.py
  static/
    vibe-check-v2.html
data/
  review_images/
  outputs/
frontend/
  src/
    App.jsx
    components/
  package.json
  vite.config.js
.env.example
vibe_check_server.py
```

## Production-style run

Build the React app, then start the Python server:

```bash
cd frontend
npm install
npm run build
cd ..
python3 vibe_check_server.py --open
```

Once `frontend/dist/index.html` exists, the Python server will serve the React build at `http://127.0.0.1:8000`.

If you have not built the React app yet, the server falls back to the legacy static HTML file in `app/static/vibe-check-v2.html`.

By default, review images now live in `data/review_images/`, and saved results go to `data/outputs/vibe_check_results.json`.

## React development

Run the Python API in one terminal:

```bash
python3 vibe_check_server.py
```

Run the React dev server in another:

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api`, `/images`, and `/health` back to the Python server on port `8000`.

## Use Cloudflare R2

1. Copy `.env.example` to `.env` or `.env.local`
2. Fill in your R2 values
3. Start the backend with `python3 vibe_check_server.py`
4. Run either the React dev server or the production build flow above

## Notes

The root `vibe_check_server.py` file is still just a thin launcher. The backend lives in `app/server.py`.

If your shell cannot find `node` or `npm`, make sure `/usr/local/bin` is on your `PATH`.
