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
  {
    // Capa demo (src/lib/demo): shim que imita la API de @supabase/supabase-js.
    // El cliente real es sin tipar (`any`) y varios métodos llevan parámetros
    // posicionales que no usamos (firmas de la API). Relajamos ESAS dos reglas
    // solo aquí; el resto de la app mantiene la configuración estricta.
    files: ['src/lib/demo/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
])
