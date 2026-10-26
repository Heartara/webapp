export function emailReadiness(settings={},env=process.env){
 const recipient=String(settings.notification_email||'').trim();
 const configuredRecipient=String(env.OWNER_NOTIFICATION_EMAIL||'').trim();
 const recipientMatches=!configuredRecipient||configuredRecipient.toLowerCase()===recipient.toLowerCase();
 const mode=env.EMAIL_MODE||'sandbox';
 const missing=[];if(!env.RESEND_API_KEY)missing.push('RESEND_API_KEY');if(!env.EMAIL_FROM)missing.push('EMAIL_FROM');
 if(mode!=='resend')missing.push('EMAIL_MODE=resend');
 const configured=Boolean(recipient)&&recipientMatches&&missing.length===0;
 return {recipient,enabled:settings.notification_enabled===true,mode,configured,ready:configured&&settings.notification_enabled===true,missing,recipient_matches:recipientMatches,sender:env.EMAIL_FROM||'',crm_url:env.CRM_PUBLIC_URL||'https://www.heartarahealing.com/crm/'};
}
