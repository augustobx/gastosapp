# GastosApp v2 — NanoLabs

PWA financiera argentina: dashboard profesional responsive, medios de pago, tarjetas, cuotas reales y registro por texto/voz con expresiones rioplatenses.

## Arquitectura

- Node.js 22 / Express, HTML/CSS/JS sin framework.
- Persistencia atómica local en /app/data/gastosapp-v2.json (volumen Docker gastosapp-data).
- No migra el JSON v1, porque se trata de una app nueva sin datos reales. El JSON anterior no se elimina.
- API protegida mediante contraseña y sesión con cookie HttpOnly. APP_PASSWORD es obligatorio en producción.
- Interpretación local gratis. Transcripción opcional mediante OpenAI; interpretación de IA remota solo con consentimiento explícito por operación.
- Compra a crédito -> cuotas independientes, asociadas a la compra y a su fecha de cierre/vencimiento.
- Pagos de cuotas cambian su estado, nunca duplican el gasto.

## Desarrollo local

    npm install
    APP_PASSWORD='una-contraseña-muy-larga' npm start
    npm test

Abrir http://localhost:3000

## Servidor Docker

    cp .env.example .env

Editar .env y configurar APP_PASSWORD (mínimo 12 caracteres). Opcional OPENAI_API_KEY. Luego:

    docker compose up -d --build
    docker compose ps
    docker compose logs --tail=100 web

Reutiliza el contenedor gastosapp-web y la red proxy del Nginx Proxy Manager. Requiere HTTPS público para micrófono. No se despliega automáticamente: desplegar tras integrar la rama a main.

## Voz y texto

1. Abrí ✦ Asistente y hablá o escribí una frase como "Me patiné 120 lucas en un celu con Visa en seis cuotas".
2. Si el navegador soporta SpeechRecognition, se utiliza el dictado nativo, que depende del navegador.
3. Sin SpeechRecognition, si OPENAI_API_KEY está configurada, usa MediaRecorder y el endpoint de transcripción. El audio se transfiere al proveedor.
4. El parser local extrae tipo, fecha, monto, categoría, cuotas y medio. Admite "lucas", "palos", "MP", etc.
5. Revisión obligatoria antes de registrar: ante datos ambiguos se exige editar.
6. La mejora opcional con IA envía el texto a OpenAI solo si se marca expresamente la opción.

## Finanzas

- Sueldo mensual: proyección automática todos los meses; no lo dupliques como otro ingreso.
- Gasto con efectivo, billetera o débito: se contabiliza en la fecha del gasto.
- Un gasto programado puede tener fecha de registro y vencimiento diferentes: se proyecta en el mes del vencimiento, queda pendiente hasta marcarlo pagado.
- El asistente detecta expresiones como "a fin de mes", "fin del mes que viene", "voy a pagar" y "pago único"; decir pago único no significa pagado.
- Al terminar de dictar aparece directamente la interpretación previa; requiere confirmación antes de guardar.
- Tarjeta de crédito: se registra la compra y se distribuye por mes de vencimiento según la configuración de la tarjeta.
- Las cuotas se marcan pagadas individualmente; los pagos no suman una segunda erogación.
- Compra posterior al cierre: primera cuota vence dos meses después de la compra.
- Fechas de cierre y vencimiento configurables entre 1 y 28. Es una simplificación para evitar meses cortos.
- El saldo es una proyección presupuestaria, no una conciliación bancaria real.
- No se conectan bancos ni se ejecutan transferencias/pagos.

## Seguridad y límites

- Nunca subir .env ni compartir los datos exportados.
- Se requieren HTTPS y contraseña larga y única en producción.
- Intentos de login limitados a 8 por IP cada 15 minutos.
- Sesiones en memoria (se cierran al reiniciar el servicio).
- Datos personales en un archivo JSON local y un solo proceso. Antes de habilitar múltiples usuarios / muchas operaciones, migrar a SQLite/PostgreSQL con transacciones y sesiones persistentes.
- Puede haber costos y tratamiento de audio por terceros si se configura OPENAI_API_KEY.
- Gastos pendientes anteriores quedan visibles en el mes en que vencían, no se trasladan automáticamente a meses siguientes.

## Tests

Ejecutar npm test y probar manualmente PC, Chrome Android, Safari iOS, instalación PWA, reconexión, micrófono y cierre/renovación de sesión.

Endpoints principales: GET /api/state?month=YYYY-MM; POST /api/transactions; PATCH /api/paid/:id; POST /api/interpret; POST /api/voice/transcribe; POST /api/accounts; PATCH /api/settings; GET /api/export.

## Dictado de importes con espacios y deudas

- Frases como «890 000 a Juanma para cancelar el crédito a fin de mes» se interpretan como $890.000, categoría Deudas y préstamos, vencimiento de fin de mes y pendiente.
- «Crédito» en «cancelar el crédito» describe una deuda, no un medio de pago. No se crea una compra financiada en tarjeta salvo que se indique explícitamente.
- Un medio de pago omitido puede quedar sin especificar y completarse después.

## Asistente conversacional de gastos (modo voz y texto)

1. Abrí el botón ✦ desde PC o celular. El asistente propone un diálogo por mensajes y, cuando el navegador lo admite, responde mediante Web Speech Synthesis en español.
2. Podés decir: «tengo que cargar algunos gastos», «tengo que pagar a Juanma 890.000 para cancelar el crédito a fin de este mes», «gasté 15 lucas en el súper», etc.
3. Cada movimiento queda **en una tanda sin guardar**. Decí «nada más» para que el asistente repita importes, vencimientos, estados y conceptos y pida confirmación.
4. Antes de guardar podés editar o quitar movimientos, o agregar otros. Decí «sí, guardar» o tocá «Guardar tanda» para registrarlos todos.
5. El servidor valida todos los movimientos y los persiste en una operación atómica; si falla algún dato no guarda parcialmente la tanda. Los reintentos con el mismo identificador evitan duplicaciones.
6. El dictado usa SpeechRecognition del navegador si existe. El **modo manos libres** es opcional y depende de permisos y soporte del navegador. Como alternativa, con OPENAI_API_KEY puede usarse transcripción de audio remota.
7. La voz de respuesta utiliza speechSynthesis del navegador sin costos de OpenAI. El reconocimiento/transcripción puede usar servicios del navegador, según cada implementación y sus políticas.
8. Por privacidad, no se envían los gastos a un modelo de chat remoto salvo que marques la opción «Mejorar interpretación con IA paga». El intérprete local sigue disponible sin API Key.
9. Los dos modos conviven: **Conversación** (tandas de varios movimientos) y **Modo rápido** (movimiento único).

## Conversación inteligente con OpenAI: uso opcional y facturado

El chat inteligente permite decir varios gastos en una sola frase y corregir importes hablando normalmente. OpenAI interpreta la conversación, genera respuestas y, cuando se habilita, voz más natural. La app siempre requiere confirmación explícita de la tanda antes de guardar.

En el servidor, completá el archivo privado .env:

    OPENAI_API_KEY=TU_CLAVE_REAL
    OPENAI_NLU_MODEL=gpt-4o-mini
    OPENAI_STT_MODEL=gpt-4o-mini-transcribe
    OPENAI_TTS_MODEL=gpt-4o-mini-tts
    OPENAI_TTS_VOICE=marin

Desplegá solamente este servicio: docker compose up -d --build --force-recreate web

Opciones del diálogo:
- Conversación inteligente: entiende frases libres, tandas, correcciones, fechas y pagos. Envía el texto y el contexto de la tanda pendiente a OpenAI.
- Transcripción precisa: graba hasta que el usuario vuelve a pulsar el micrófono, y usa API en vez del motor de navegador.
- Voz natural: MP3 con gpt-4o-mini-tts, voz marin e indicaciones de acento argentino. La voz es generada por inteligencia artificial, no es una persona. Vuelve a voz del navegador si falla.
- Manos libres: opción experimental, solo con SpeechRecognition del navegador.

Chat, transcripción y voz generan costos independientes. Los límites de solicitudes por minuto NO equivalen a presupuesto mensual: controlá créditos, límites y avisos en la plataforma OpenAI.

Privacidad: jamás colocar la clave en el frontend ni compartirla en el chat. Los gastos se envían a OpenAI solo al habilitar las funciones IA. Los datos no se guardan en GastosApp hasta que el usuario confirma. Lotes atómicos/idempotentes.

Ejemplo esperado: "Primero 980000 a Juana, 160000 a Personal y 300000 del supermercado, todo a fin de mes". La IA debe presentar TRES gastos separados (980000, 160000, 300000), pendientes y con vencimiento a fin de mes.

## Diagnóstico y calidad de voz (v8)

En Configuración > Conexión con OpenAI hay 3 pruebas **reales e independientes**:
1. Interpretación: solicita una respuesta pequeña al modelo OPENAI_NLU_MODEL.
2. Transcripción: envía un WAV de silencio sintético de 1,25 segundos al modelo OPENAI_STT_MODEL. Espera HTTP 200 con campo text (puede estar vacío); no prueba tu micrófono físico.
3. Voz: genera un MP3 corto con OPENAI_TTS_MODEL y la voz elegida (Marin, Cedar, Coral, etc.). También podés escuchar un ejemplo con el reproductor nativo del navegador.

El panel informa HTTP 200 o el estado upstream de OpenAI con código, explicación y posible solución. Errores típicos: 401 clave revocada, 403 sin permisos, 404 modelo inválido, 429 cuota, crédito o límite de velocidad, 400 audio rechazado, timeout/red. Los errores no revelan credenciales. Cada prueba cuesta una pequeña cantidad de API; no se ejecuta automáticamente en cada apertura. El consumo real se controla desde https://platform.openai.com/usage.

### Si dice "No pude transcribir"

La transcripción del chat ahora muestra tamaño en KB, MIME del navegador, modelo, código HTTP que devuelve OpenAI (y código/mensaje/hint). Distingue micrófono no autorizado, ausencia de micrófono, grabación menor a 0,85 s, archivo vacío, formato incorrecto, saldo, permisos y fallas del servidor. Al grabar, tocá el micrófono para iniciar y volvé a tocarlo para detener después de hablar. Se negocia el formato con MediaRecorder.isTypeSupported.

### Si la voz es robótica

El modo Voz natural usa audio MP3 de OpenAI con indicaciones de español argentino y selección de voces en Configuración (Marin predeterminada; Cedar como alternativa). La aplicación **ya no cae silenciosamente** a speechSynthesis cuando falla OpenAI: aparece un aviso claro. Si el navegador bloquea autoplay, tocá "Volver a escuchar", o utilizá el reproductor con controles de la vista Configuración. SpeechSynthesis queda disponible solamente cuando desactivás Voz natural o la API no está configurada.

El TTS es voz sintética de IA y no una grabación humana. La naturalidad real varía según voz, modelo, navegador y reproducción. Usar Voz natural, Transcripción IA y Conversación IA consume créditos por separado. Los tests reales necesitan OPENAI_API_KEY en el contenedor; nunca subir .env a GitHub.

**Despliegue seguro**: estando en /opt/apps/gastosapp ejecutar git pull --ff-only origin main, docker compose config -q, docker compose up -d --build --force-recreate web. Solo afecta servicio web de GastosApp, preserva volumen.

## Google Gemini + OpenAI: proveedores seleccionables por función

Documentación oficial verificada el 20/10/2026:
- Modelos https://ai.google.dev/gemini-api/docs/models
- Contenido / formato JSON https://ai.google.dev/api/generate-content
- Audio de entrada / transcripción con Flash https://ai.google.dev/gemini-api/docs/generate-content/audio
- TTS: Interactions API, formato WAV https://ai.google.dev/gemini-api/docs/speech-generation
- Precios, cuotas y capa gratuita: https://ai.google.dev/gemini-api/docs/pricing

Crear una API key propia de Gemini en https://aistudio.google.com/apikey. No usar la clave de OpenAI; son proveedores independientes. Pegarla **únicamente** en el archivo privado /opt/apps/gastosapp/.env:

    GEMINI_API_KEY=TU_CLAVE_GOOGLE
    GEMINI_NLU_MODEL=gemini-3.8-flash
    GEMINI_STT_MODEL=gemini-3.8-flash
    GEMINI_TTS_MODEL=gemini-3.8-flash-tts
    GEMINI_TTS_VOICE=Kore

OPENAI_API_KEY puede permanecer configurada y seguir utilizándose. En Configuración > OpenAI y Google Gemini se elige **por separado** el proveedor para interpretación, transcripción y voz. El navegador guarda esas preferencias localmente. La clave nunca llega al frontend. Si una clave falta, la interfaz deshabilita sus pruebas y pide configurar el proveedor. No hay cambio silencioso de proveedor ante errores (para no generar costos inesperados).

Modelos Gemini elegidos según soporte documentado:
- **Conversación** `gemini-3.8-flash`, `models/...:generateContent`, entradas texto, output JSON estructurado (generationConfig.responseFormat.text.schema) con validación de lote del servidor.
- **Transcripción** `gemini-3.8-flash`, que recibe audio inline (WebM/WAV/MP3/etc) con generateContent y devuelve texto mediante instrucciones literales. **No es** `gemini-3.5-transcribe`: ese modelo especializado tiene un flujo distinto basado en la API de Interactions y subida de archivos; no se expone como opción equivalente en esta implementación.
- **Voz natural** `gemini-3.8-flash-tts`, Interactions API POST /v1beta/interactions, con salida WAV RIFF completa (NO PCM sin cabecera ni MP3) y voces predefinidas documentadas, por defecto Kore. Modelo alternativo opcional en .env: `gemini-3.8-flash-lite-tts` (mismo esquema; menor costo y latencia).

La capa gratuita depende del modelo, región, límites diarios, facturación y proyecto. Gemini NO reemplaza de forma automática a OpenAI y NO garantiza uso gratuito ilimitado. Las pruebas que generan texto/audio pueden consumir créditos; el test de conexión solo lista modelos.

Seguridad y despliegue: `git pull --ff-only origin main` y `docker compose up -d --build --force-recreate web` dentro de GastosApp. Nunca borrar volúmenes ni tocar otros contenedores. Test HTTP 200 por proveedor antes de usar los micrófonos reales. El modo conversacional exige confirmación antes del guardado atómico.

## Errores reales de tareas Gemini en el panel (v12)

Cuando una tarea Gemini fallaba, el cliente descartaba los campos de error al convertir la respuesta en un objeto Error. La PWA v12 ahora conserva proveedor, HTTP de Google, codigo, mensaje y recomendacion. Hay tests que simulan errores HTTP 400 con detalle. Un test de conexion HTTP 200 no demuestra que una generacion tenga cuota o parametros correctos. Si falla una prueba, primero leer el mensaje especifico antes de cambiar modelos o API keys.

## Reintentos y selección de modelo según documentación Gemini (octubre de 2026)

El cliente REST de GastosApp reintenta errores temporales HTTP 503/500/502/504/408 con pausas progresivas y jitter; 429 solo si el error señala un rate limit temporal, no una cuota agotada. No reintenta 400/401/403/404. Al terminar los reintentos sin éxito, mantiene el HTTP de Google y la cantidad de intentos en el diagnóstico.

Documentación oficial: https://ai.google.dev/gemini-api/docs/troubleshooting y https://ai.google.dev/gemini-api/docs/api-errors

Los modelos estables alternativos documentados son gemini-3.6-flash y gemini-3.5-flash-lite (ambos admiten audio de entrada y JSON estructurado). Se pueden probar indicando GEMINI_NLU_MODEL y GEMINI_STT_MODEL en .env, sin cambiar ni reiniciar la voz Gemini TTS. Gemini 3.8 Flash usa thinkingLevel low. En Gemini 3.6 Flash el cliente omite esa configuración, y Gemini 3.5 Flash-Lite usa su nivel minimal por defecto. Se usa responseFormat.text.mimeType application/json.

Esas alternativas NO se activan automáticamente, para no generar consumos inesperados. Los tests simulan errores de Google sin usar la clave real ni gastar crédito. Las pruebas reales se hacen desde el servidor del usuario.

Documentación de modelos: https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.6 , https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash , https://ai.google.dev/gemini-api/docs/generate-content/structured-output , https://ai.google.dev/gemini-api/docs/generate-content/audio .

## Corrección de errores de voz natural (PWA v13)

- Un HTTP 502 de un intermediario Cloudflare/Nginx suele devolver HTML y no JSON. Ahora la interfaz lee Content-Type, comprueba si la respuesta provino de GastosApp y presenta la causa visible y el HTTP real; no vuelve a mostrar solamente 'Sin detalle del servidor'. Si Express entrega JSON, el aviso conserva proveedor, código y solución.
- Después de una falla de síntesis se suspenden los intentos automáticos de voz en el chat (texto y registro siguen funcionando). El usuario puede reintentar con 'Volver a escuchar' o reactivar la voz. No hay cambio silencioso a speechSynthesis.
- El chat sintetiza un extracto de hasta ~200 caracteres; el detalle financiero completo se conserva en pantalla, para evitar generar WAV largos y latencia innecesaria. La voz Gemini devuelve WAV, OpenAI MP3.
- Logs de TTS: provider, model, status, code, longitud de texto y mensaje, sin mostrar el texto financiero ni las claves.
- Las pruebas cubren Cloudflare 502 HTML, 503 JSON de Google, texto corto y respuesta WAV del endpoint autenticado. CI ejecuta chequeo de sintaxis para los nuevos módulos.

Si persiste el problema: ejecutar en Donweb `docker logs --tail 60 gastosapp-web` justo despues del error, sin compartir secretos; inspeccionar registros TTS y luego proxy si la respuesta es HTML.

## Voz Gemini asíncrona y cuota gratuita (PWA v14)

El 20/10/2026 se comprobó que la ruta interna de TTS respondió HTTP 200 con 198118 bytes WAV tras 20555 ms, sin reinicios/OOM. En otra solicitud Google registró `429 too_many_requests` con el límite de Free Tier reportado para esa clave de 10 solicitudes por día de `gemini-3.8-flash-tts` y plazo de espera de aproximadamente 16 horas. Ambos resultados son de intentos diferentes; el HTTP 502 HTML de Cloudflare no prueba por sí solo un 429.

Para no mantener conexiones Cloudflare/Nginx abiertas mientras sintetiza, el chat y la previsualización utilizan POST /api/chat/speech/queue (HTTP 202) y consultan GET /api/chat/speech/task/:id hasta completarse. GET /api/chat/speech/task/:id/audio descarga el archivo WAV/MP3 bajo autenticación de la misma sesión. El estado nunca contiene bytes ni URL externa. Los trabajos y WAV se guardan temporalmente solo en RAM y vencen a los 4 minutos. Se reutilizan dentro de la misma sesión audios con texto/modelo/voz idénticos durante ese período, en vez de gastar otra solicitud. El saludo inicial del chat se muestra escrito sin generar audio; la voz de los demás mensajes sigue opcional.

HTTP 429 con cuota diaria agotada no se reintenta automáticamente. La PWA muestra el mensaje real, suspende la reproducción automática hasta que el usuario elija reintentar y mantiene la conversación escrita operativa. Para tener voz disponible en uso cotidiano hay que esperar al reinicio de cuota o habilitar un nivel de facturación adecuado; el cambio de endpoint no aumenta la cuota gratuita. No se activan proveedores de pago silenciosamente.

Pruebas unitarias y HTTP: cola, resultado pendiente/completado/fallido, aislamiento de sesión, ausencia de datos de audio en JSON, deduplicación de muestras, subida de WAV y 429 real sin consumir la clave del usuario. No modificar Nginx Proxy Manager ni el resto de contenedores.

## Uso, tokens y costos de IA (PWA v15)

Configuración incorpora un módulo de consumo por día, mes y desde la activación, con totales por proveedor, modelo y función. Muestra solicitudes exitosas/fallidas, tokens de entrada, salida y razonamiento cuando lo informa cada API, y costo EQUIVALENTE A TARIFA DE PAGO EN USD. Este importe es una **estimación parcial, no es saldo ni factura real**; para usuarios Gemini Free Tier el costo real puede ser cero. Tampoco incluye actividad realizada desde otras apps que utilicen la misma clave. Los resultados sin datos de tokens se marcan "sin medir", sin inventar cantidades.

Persistencia: contadores agregados y alertas en `/app/data/ai-usage.json` en el volumen Docker existente `gastosapp-data`, con reemplazo atómico y permisos del archivo 0600. No registra textos financieros, claves ni bytes de audios. El historial empieza al desplegar esta versión: no se inventan tokens de pruebas anteriores.

Fuentes y esquema:
- Google `usageMetadata.promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`: https://ai.google.dev/api/generate-content
- Gemini Interactions `usage.total_input_tokens`, `usage.total_output_tokens`: https://ai.google.dev/api/interactions-api
- OpenAI chat `usage.prompt_tokens` y `completion_tokens`: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
- Tarifas pagas verificadas el 20/10/2026: https://ai.google.dev/gemini-api/docs/pricing y https://developers.openai.com/api/docs/pricing . Las tarifas de Gemini 3.8 y 3.6 Flash/TTS son introductorias hasta 31/12/2026; deben revisarse en 2027. El valor de caché se estima con tarifa normal, por lo que el USD mostrado puede sobreestimar cargos reales. No se descuentan promociones ni cuotas gratuitas.

Alertas de uso: clasifica HTTP 429 con "requests per day / Free Tier" como **cuota gratuita diaria agotada** (no "sin saldo"); los códigos `credit_balance_exhausted` / `insufficient_quota` / mensajes de facturación como **créditos o facturación agotados**; rate limit temporal, saturación HTTP 503 y problemas de permisos como causas diferentes. Reporta última incidencia y su renovación si Google la informa; no afirma que un error pasado siga vigente.

Se contabilizan llamadas realizadas por GastosApp a Gemini mediante `generateContent` e `Interactions`, y a OpenAI mediante chat, STT y TTS. TTS binario de OpenAI normalmente no comunica tokens en esa respuesta; cuenta la solicitud pero deja tokens y costo como no medidos. Tests de cálculos, persistencia, privacidad, categorías, temporalidad y API autenticada. No modificar otros contenedores ni borrar el volumen de datos. No se requiere configurar variables .env adicionales.
