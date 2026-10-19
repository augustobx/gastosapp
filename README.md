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
