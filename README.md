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
