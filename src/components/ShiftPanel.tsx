import React,{useEffect,useState} from 'react';
import {View,Text,TextInput,Button,Alert,AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {syncPendingDelivery} from '../services/delivery';
import {supabase} from '../services/supabase';
export default function ShiftPanel(){
 const [data,setData]=useState<any>(null),[hours,setHours]=useState('4'),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const rpc=async(name:string,args:Record<string,unknown>={})=>{const token=await AsyncStorage.getItem('@pideya_driver_token');if(!token)throw Error('Inicia sesión');const r=await supabase.rpc(name,{...(name==='report_order_incident'?{p_driver_token:token}:{p_token:token}),...args});if(r.error)throw r.error;return r.data;};
 const load=async()=>{try{await syncPendingDelivery();setData(await rpc('driver_operations'));setError('');}catch(e:any){setError(e.message);}};
 useEffect(()=>{void load();const t=setInterval(()=>void load(),30000);const s=AppState.addEventListener('change',v=>{if(v==='active')void load();});return()=>{clearInterval(t);s.remove();};},[]);
 const act=async(name:string,args:Record<string,unknown>)=>{setBusy(true);try{await rpc(name,args);await load();}catch(e:any){Alert.alert('No se pudo guardar',e.message);}finally{setBusy(false);}};
 return <View style={{padding:16,backgroundColor:'#fff7ed',gap:8}}>
 <Text style={{fontSize:18,fontWeight:'700'}}>Mi turno y efectivo</Text>
 {!!error&&<Text>{error}</Text>}
 <Text>{data?.shift?`Disponible hasta ${new Date(data.shift.available_until).toLocaleTimeString()} · ${data.shift.accepting?'Recibiendo pedidos':'Terminando turno'}`:'Sin turno activo'}</Text>
 <TextInput accessibilityLabel="Horas disponibles" value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholder="Horas disponibles" style={{borderWidth:1,padding:8}}/>
 <Button title="Activar / extender disponibilidad" disabled={busy} onPress={()=>{const n=Number(hours);if(!Number.isFinite(n)||n<=0||n>12)return Alert.alert('Hora inválida','Indica hasta 12 horas');void act('driver_set_shift',{p_until:new Date(Date.now()+n*3600000).toISOString()});}}/>
 {data?.shift&&<Button title="Dejar de recibir pedidos" disabled={busy} onPress={()=>void act('driver_set_shift',{p_until:null})}/>}
 {data?.cycle&&<><Text>Pedido con custodia · {data.cycle.state}. Cobro esperado: ${data.cycle.expected_cash}. Regresa y liquida antes de otra salida.</Text>
 <TextInput accessibilityLabel="Motivo o incidencia" value={note} onChangeText={setNote} placeholder="Motivo del regreso / lo ocurrido" style={{borderWidth:1,padding:8}}/>
 <Button title="Reportar incidencia" disabled={busy} onPress={()=>void act('report_order_incident',{p_order_id:data.cycle.order_id,p_cause:'OTHER',p_description:note})}/>
 {data.cycle.state==='OUT'&&<Button title="Informar regreso al negocio" disabled={busy} onPress={()=>void act('driver_return_order',{p_order_id:data.cycle.order_id,p_note:note})}/>}</>}
 <Button title="Actualizar turno" disabled={busy} onPress={()=>void load()}/>
 </View>;
}
