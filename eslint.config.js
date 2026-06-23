import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // El plugin react-hooks v6 (reglas del React Compiler, aún RC) marca como
      // ERROR el patrón "cargar datos al montar" (setState dentro de un useEffect
      // de montaje), que esta app usa de forma intencional y correcta en casi
      // todos los componentes. Lo dejamos como warning: conserva visibilidad sin
      // forzar un refactor masivo de componentes que funcionan. Un futuro hook
      // tipo useFetch podría eliminarlos de raíz.
      'react-hooks/set-state-in-effect': 'warn',
      // Regla RC muy estricta sobre orden de declaración; el único caso restante
      // vive en el código del escáner (inactivo). Warning para no bloquear.
      'react-hooks/immutability': 'warn',
    },
  },
])
