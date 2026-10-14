import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.117.2';
const config=window.ELEVA_CONFIG||{};
export function publicConfigurationError() {
  if(!config.supabaseUrl||!config.supabasePublishableKey) return 'Configura la URL de Supabase y su clave pública en config.js.';
  try{const url=new URL(config.supabaseUrl);if(!['https:','http:'].includes(url.protocol))return 'La URL de Supabase no es válida.';}catch{return 'La URL de Supabase no es válida.';}
  const key=config.supabasePublishableKey;
  if(key.startsWith('sb_secret_'))return 'Usa una clave pública, no una clave de servidor.';
  if(key.split('.').length===3){try{if(JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/'))).role!=='anon')return 'Usa una clave pública de Supabase.';}catch{return 'La clave pública no es válida.';}}
  if(!key.startsWith('sb_publishable_') && key.split('.').length!==3)return 'La clave pública no es válida.';
  return '';
}
export const supabase=publicConfigurationError()?null:createClient(config.supabaseUrl,config.supabasePublishableKey);
