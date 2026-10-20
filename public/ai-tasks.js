// Errores normalizados para tareas Gemini/OpenAI y peticiones HTTP.
export function taskError(details = {}) {
 const info = details && typeof details === 'object' ? details : {error:String(details)};
 const message = String(info.error || info.message || 'El proveedor no informó el motivo de la falla.');
 const error = new Error(message);
 error.provider = info.provider || null;
 error.code = info.code || 'ai_task_failed';
 error.upstreamStatus = info.upstreamStatus || null;
 error.httpStatus = info.httpStatus || null;
 error.hint = info.hint || null;
 error.requestId = info.requestId || null;
 return error;
}
export function describeAiError(error, fallbackProvider = 'gemini') {
 const provider = error?.provider || fallbackProvider;
 const providerName = provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : 'GastosApp';
 const status = error?.upstreamStatus
   ? providerName + ' HTTP ' + error.upstreamStatus
   : error?.httpStatus ? 'GastosApp HTTP ' + error.httpStatus : providerName + ' (sin código HTTP)';
 const code = error?.code || 'error_desconocido';
 const reason = String(error?.error || error?.message || 'El servidor no devolvió detalles.');
 const advice = error?.hint ? ' · SOLUCIÓN: ' + error.hint : '';
 const requestId = error?.requestId ? ' · Solicitud: ' + error.requestId : '';
 return status + ' · ' + code + ' · ' + reason + advice + requestId;
}
export async function waitTask(initial, read, progress, options = {}) {
 if (!initial?.taskId) return initial;
 const attempts = options.attempts ?? 60;
 const intervalMs = options.intervalMs ?? 1500;
 const delay = options.delay || (ms => new Promise(resolve => setTimeout(resolve, ms)));
 for (let attempt = 0; attempt < attempts; attempt++) {
  await delay(intervalMs);
  const result = await read('/api/ai/tasks/' + encodeURIComponent(initial.taskId));
  if (result?.status === 'done') return result.data;
  if (result?.status === 'failed') throw taskError(result.error);
  if (result?.status !== 'working') throw taskError({
    provider: 'gastosapp', code: 'invalid_task_state',
    error: 'El servidor devolvió un estado de tarea desconocido: ' + String(result?.status)
  });
  if (attempt === 6 || attempt === 25) progress?.('Gemini sigue procesando; no repitas la operación.');
 }
 throw taskError({
  provider: 'gastosapp', code: 'ai_task_timeout',
  error: 'La espera superó el máximo permitido. Ningún gasto fue guardado.',
  hint: 'Revisá el estado de Gemini y los registros del contenedor.'
 });
}
