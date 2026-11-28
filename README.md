# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Client website access

In **Settings → DeepSeek site assistant**, add the DeepSeek API key. EpicGlobal stores it encrypted on the API server; it is not exposed to the browser. The server generates and persists a separate `SERVER_SECRETS_KEY` in its private `.env` file when needed. A backend environment variable named `DEEPSEEK_API_KEY` can also be used as a fallback. In **Deployments → File Manager**, create a client access link for a static site and give the client the link and password separately. Links expire after 30 days and can be revoked from the same file manager.

Each link is limited to one static site. Clients can browse, upload, create, edit, and delete that site's files. The DeepSeek assistant makes targeted text replacements instead of rewriting existing files, and proposed changes must be reviewed before they are applied. JPEG, PNG, GIF, and WebP images up to 4 MB can be attached as visual references; the assistant can analyze placement requests and stage an image file for approval. Applied assistant changes and text-editor saves are recorded in a per-site history so clients can undo them when the files have not since changed. History backups are stored outside the served websites in the ignored `client-file-history/` directory. PDF and Office documents are not parsed by the assistant.

In **Deployments → File Manager**, the host-only assistant opens automatically and can select any registered static website, inspect its files, stage targeted edits or new files, attach image references, and review or undo applied changes. Host assistant responses allow up to 8,192 output tokens and larger file-operation budgets than the client assistant. Selecting **Create a new static website** lets the assistant build a complete site; a non-empty root `index.html` is required, and the website is registered and deployed only after the host approves the staged files. Both assistants return organized plain-text responses without Markdown formatting. In the client portal, the page stays within the screen: the file panel and chat can be switched on mobile, while only the response area scrolls and the message entry remains fixed.

Set `ORCHESTRATOR_OWNER_PASSWORD` in the API server's private `.env` file to enable owner sign-in. The dashboard uses an HTTP-only session cookie and loads the server-managed `ORCHESTRATOR_API_KEY` after sign-in; the API key is not persisted in browser storage, so it does not need to be re-entered on each device. The owner password is never embedded in the frontend build. External integrations can continue using `ORCHESTRATOR_API_KEY` directly.

The DeepSeek key saved in **Settings → DeepSeek site assistant** is encrypted in `server-secrets.json` on the API server and is shared by devices that connect to that same server. Keep that file and the generated `SERVER_SECRETS_KEY` in the server's private `.env` backed up together.

Cloudflare Workers static-asset uploads use `wrangler.jsonc`, which points Wrangler at the Vite `dist/` output. If the deployed Worker has a different name, update the `name` field to match it.

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
