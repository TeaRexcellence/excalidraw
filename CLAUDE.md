# CLAUDE.md

## Project Structure

Excalidraw is a **monorepo** with a clear separation between the core library and the application:

- **`packages/excalidraw/`** - Main React component library published to npm as `@excalidraw/excalidraw`
- **`excalidraw-app/`** - Full-featured web application (excalidraw.com) that uses the library
- **`packages/`** - Core packages: `@excalidraw/common`, `@excalidraw/element`, `@excalidraw/math`, `@excalidraw/utils`
- **`examples/`** - Integration examples (NextJS, browser script)

## Development Workflow

1. **Package Development**: Work in `packages/*` for editor features
2. **App Development**: Work in `excalidraw-app/` for app-specific features
3. **Testing**: Always run `yarn test:update` before committing
4. **Type Safety**: Use `yarn test:typecheck` to verify TypeScript

## Development Commands

```bash
yarn test:typecheck  # TypeScript type checking
yarn test:update     # Run all tests (with snapshot updates)
yarn fix             # Auto-fix formatting and linting issues
```

## Dev Server Rules (IMPORTANT)

**DO NOT start the dev server yourself.** Always ask the user to run, restart, or kill it.

- The server runs on **port 3000 only** via `yarn start`
- Never start multiple servers or use other ports

### If you need to kill orphaned servers on Windows:

1. Find processes: `netstat -ano | findstr ":3000" | findstr "LISTENING"`
2. Kill by PID: `taskkill //F //PID <pid>`

Example:
```bash
netstat -ano | findstr ":3000" | findstr "LISTENING"
# Output: TCP [::1]:3000 [::]:0 LISTENING 55280

taskkill //F //PID 55280
# SUCCESS: The process with PID 55280 has been terminated.
```

## Architecture Notes

### Package System

- Uses Yarn workspaces for monorepo management
- Internal packages use path aliases (see `vitest.config.mts`)
- Build system uses esbuild for packages, Vite for the app
- TypeScript throughout with strict configuration
