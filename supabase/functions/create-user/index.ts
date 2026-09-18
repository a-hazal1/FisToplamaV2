import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
Deno.serve(async (req) => {
  try {
    const authHeader=req.headers.get('Authorization'); if(!authHeader) return new Response(JSON.stringify({error:'Unauthorized'}),{status:401});
    const url=Deno.env.get('SUPABASE_URL')!, anon=Deno.env.get('SUPABASE_ANON_KEY')!, service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authHeader}}});
    const {data:{user}}=await userClient.auth.getUser(); if(!user) return new Response(JSON.stringify({error:'Unauthorized'}),{status:401});
    const {data:profile}=await userClient.from('profiles').select('role').eq('id',user.id).single();
    if(profile?.role!=='admin') return new Response(JSON.stringify({error:'Admin yetkisi gerekli'}),{status:403});
    const body=await req.json(); const {email,password,full_name,role,branch_id}=body;
    if(!email||!password||!full_name) return new Response(JSON.stringify({error:'Eksik alan'}),{status:400});
    const admin=createClient(url,service);
    const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name,role,branch_id:branch_id??''}});
    if(error) return new Response(JSON.stringify({error:error.message}),{status:400});
    return new Response(JSON.stringify({user_id:data.user?.id}),{status:200,headers:{'Content-Type':'application/json'}});
  } catch(e) { return new Response(JSON.stringify({error:String(e)}),{status:500}); }
})
