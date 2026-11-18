import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { sql } from "@/lib/db";
const allowedRoles=new Set(["ADMIN","FINANCE","GUDANG","SALES","PRODUKSI","QUALITY","DISTRIBUSI","PELANGGAN","MITRA"]);
export async function POST(request:Request){
 const {data:session}=await auth.getSession();
 if(!session?.user?.id||!session.user.email)return NextResponse.json({error:"Sesi pendaftaran tidak ditemukan. Silakan daftar kembali."},{status:401});
 let body:{fullName?:string;phone?:string;requestedRole?:string;reason?:string};try{body=await request.json();}catch{return NextResponse.json({error:"Data pendaftaran tidak valid."},{status:400});}
 const fullName=body.fullName?.trim().slice(0,120)??"";const phone=body.phone?.trim().slice(0,32)||null;const requestedRole=body.requestedRole??"";const reason=body.reason?.trim().slice(0,500)||null;
 if(fullName.length<2||!allowedRoles.has(requestedRole))return NextResponse.json({error:"Nama dan pilihan peran wajib diisi dengan benar."},{status:400});
 try{const orgs=await sql`SELECT id FROM organizations WHERE is_active=true ORDER BY created_at ASC LIMIT 1`;if(!orgs[0])return NextResponse.json({error:"Organisasi belum dikonfigurasi. Hubungi administrator."},{status:503});const orgId=orgs[0].id as string;
 const profiles=await sql`INSERT INTO user_profiles(organization_id,auth_subject,full_name,email,phone,status) VALUES(${orgId},${session.user.id},${fullName},${session.user.email},${phone},'invited') ON CONFLICT(auth_subject) DO UPDATE SET full_name=EXCLUDED.full_name,phone=EXCLUDED.phone,updated_at=now() WHERE user_profiles.status='invited' RETURNING id`;
 if(!profiles[0])return NextResponse.json({error:"Akun ini sudah terdaftar. Silakan masuk atau hubungi administrator."},{status:409});
 await sql`INSERT INTO access_role_requests(organization_id,user_id,requested_role,reason) VALUES(${orgId},${profiles[0].id as string},${requestedRole},${reason})`;
 return NextResponse.json({ok:true,message:"Pendaftaran diterima dan menunggu persetujuan administrator."});
 }catch(error){console.error("role request submission failed",error);return NextResponse.json({error:"Pendaftaran belum dapat disimpan. Silakan coba kembali."},{status:500});}
}