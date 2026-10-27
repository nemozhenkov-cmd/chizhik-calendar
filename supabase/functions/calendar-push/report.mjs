export function pushIssueInfo(code){
 const known={
 push_status_400:['HTTP 400','Сервис отклонил параметры запроса. Точную ошибку параметров сервис в сохранённом отчёте не указал.'],
 push_status_401:['HTTP 401','Сервис не принял авторизацию отправителя уведомлений.'],
 push_status_403:['HTTP 403','Сервис запретил отправку. Возможна проблема с правами или ключами отправителя; точная причина не сохранена.'],
 push_status_404:['HTTP 404','Адрес подписки больше не найден. Подписка удалена из рассылок.'],
 push_status_410:['HTTP 410','Подписка устройства больше не действует. Она удалена из рассылок; причину отключения сервис не сообщил.'],
 push_status_413:['HTTP 413','Сообщение превышает допустимый размер push-сервиса.'],
 push_status_429:['HTTP 429','Сервис ограничил частоту отправки. Если попытки не исчерпаны, приложение повторит отправку автоматически.'],
 push_status_0:['NO_RESPONSE','Ответ push-сервиса не получен. В старой записи не сохранено, был ли это таймаут, сбой соединения или подготовки запроса.'],
 request_timeout:['TIMEOUT','Push-сервис не ответил за 10 секунд.'],
 network_error:['NETWORK_ERROR','Не удалось получить ответ по сети. Точная причина соединения недоступна.'],
 request_preparation_failed:['REQUEST_PREPARATION_FAILED','Не удалось подготовить или зашифровать запрос уведомления.'],
 subscription_invalid:['INVALID_SUBSCRIPTION','Данные подписки устройства недействительны. Подписка удалена из рассылок.'],
 subscription_removed:['SUBSCRIPTION_REMOVED','Подписка устройства была удалена до отправки.'],
 retry_limit:['RETRY_LIMIT','Исчерпаны 3 попытки отправки. Последняя конкретная причина в этой записи не сохранилась.']
 };
 if(known[code])return {code:known[code][0],reason:known[code][1]};
 const match=/^push_status_(\d{3})$/.exec(code||'');
 if(match)return {code:`HTTP ${match[1]}`,reason:Number(match[1])>=500?'Ошибка на стороне push-сервиса. Подробная причина сервисом в сохранённом отчёте не указана.':'Push-сервис отклонил запрос. Подробная причина в сохранённом отчёте отсутствует.'};
 return {code:'UNKNOWN',reason:'Причина не сохранилась. Код ответа сервиса недоступен.'};
}
export function groupPushIssues(rows){const grouped=new Map();for(const row of rows){const state=['failed','expired','pending','sending'].includes(row.state)?row.state:null;if(!state||(!row.last_error&&['pending','sending'].includes(state)))continue;const raw=/^push_status_\d{1,3}$/.test(row.last_error)||['request_timeout','network_error','request_preparation_failed','subscription_invalid','subscription_removed','retry_limit'].includes(row.last_error)?row.last_error:'unknown';const key=state+':'+raw;const item=grouped.get(key)||{state,code:raw,count:0};item.count++;grouped.set(key,item);}return [...grouped.values()];}
