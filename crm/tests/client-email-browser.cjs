const {chromium}=require('playwright');
const {Client}=require('pg');
const {randomUUID,createHash}=require('node:crypto');
(async()=>{
 const {startStack}=await import('./local-stack.js');
 const synthetic={EMAIL_MODE:'resend',RESEND_API_KEY:'synthetic-sender',RESEND_RECEIVING_API_KEY:'synthetic-receiver',RESEND_WEBHOOK_SECRET:'synthetic-webhook',EMAIL_FROM:'sender@example.invalid',EMAIL_REPLY_DOMAIN:'reply.example.invalid'};
 const old={};for(const [key,value]of Object.entries(synthetic)){old[key]=process.env[key];process.env[key]=value;}
 const stack=await startStack(),base=stack.base;
 const db=new Client({connectionString:'postgresql://postgres@127.0.0.1:55432/heartara_test'});await db.connect();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1250,height:1000}}),name='Client email browser '+Date.now(),email='conversation-'+Date.now()+'@example.invalid';const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/contact.html?topic=oracle');await page.fill('#enquiry-name',name);await page.fill('#enquiry-email',email);await page.fill('#enquiry-message','A synthetic enquiry for conversation testing.');await page.check('[name=consent]');await page.getByRole('button',{name:'Send my enquiry'}).click();await page.locator('.form-status').filter({hasText:'Your enquiry has been saved'}).waitFor();
 await page.goto(base+'/crm/');await page.fill('#login-email','owner@example.invalid');await page.fill('#login-password','synthetic-test-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#workspace:not([hidden])').waitFor();await page.locator('#crm-nav').getByRole('button',{name:'Enquiries',exact:true}).click();await page.locator('.toolbar [name=q]').fill(name);await page.getByRole('button',{name:'Apply filters'}).click();await page.locator('#list-results tr').filter({hasText:name}).getByRole('button',{name:'Create contact',exact:true}).click();await page.getByRole('heading',{name:'Contact details',exact:true}).waitFor();
 for(let i=1;i<=2;i++){
  await page.getByRole('button',{name:'Write email',exact:true}).click();await page.locator('#editor [name=subject]').fill('Your Heartara enquiry');await page.locator('#editor [name=body]').fill('Message '+i+' from Penny.');await page.locator('#editor').getByRole('button',{name:'Send email',exact:true}).click();await page.locator('#global-status').filter({hasText:'Email queued'}).waitFor();await page.locator('.client-email-panel .email-message').filter({hasText:'Message '+i+' from Penny.'}).waitFor();
 }
 const thread=(await db.query('select t.* from public.client_email_threads t join public.contacts c on c.id=t.contact_id where c.name=$1',[name])).rows[0];
 const jobs=(await db.query('select * from public.claim_client_emails(25)')).rows;for(const job of jobs)await db.query("select public.finish_notification($1,$2,'provider_accepted',$3,null)",[job.id,job.lease_token,'synthetic-provider-'+randomUUID()]);
 const hash=createHash('sha256').update(randomUUID()).digest('hex');await db.query('update public.client_email_threads set reply_token_hash=$1 where id=$2',[hash,thread.id]);await db.query('select public.record_client_email_reply($1,$2,$3,$4,$5,$6,null,0)',[thread.id,hash,'synthetic-incoming-'+randomUUID(),email,'Re: Your Heartara enquiry','Thanks Penny! <script>window.badEmail=true</script>']);
 await page.getByRole('button',{name:'Refresh conversation',exact:true}).click();await page.locator('.email-message').filter({hasText:'Thanks Penny!'}).waitFor();if(await page.evaluate(()=>window.badEmail))throw Error('Email HTML executed');await page.getByRole('button',{name:'Write email',exact:true}).click();await page.locator('#editor [name=body]').fill('A third reply after the client answered.');await page.locator('#editor').getByRole('button',{name:'Send email',exact:true}).click();await page.locator('.email-message').filter({hasText:'A third reply after the client answered.'}).waitFor();
 for(const width of [1250,390]){await page.setViewportSize({width,height:1000});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Conversation overflow');await page.locator('#screen').screenshot({path:'/tmp/heartara-client-email-'+width+'.png'});}
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS: three CRM emails, received reply in contact history, compose remains available, message HTML stays inert, desktop/mobile layout. Fake provider only; no real mail.');
 }finally{await db.end();await browser.close();await stack.close();for(const [key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
})().catch(error=>{console.error(error);process.exit(1)});
