// Vercel may return an object-shaped error before a request reaches our API.
export function submissionError(result,status){
 const error=result?.error;
 if(status===401||status===403){
  if(typeof error==='string')return error;
  return 'This preview blocked the request. Open the latest deployment with Vercel’s Visit button, then try again.';
 }
 if(typeof error==='string'&&error.trim())return error;
 if(error&&typeof error==='object'&&typeof error.message==='string'&&error.message.trim())return error.message;
 return 'Your request could not be saved. Please keep this page open and try again.';
}
