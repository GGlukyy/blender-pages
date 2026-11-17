(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))o(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const c of i.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&o(c)}).observe(document,{childList:!0,subtree:!0});function n(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function o(r){if(r.ep)return;r.ep=!0;const i=n(r);fetch(r.href,i)}})();const On="/tmp/mcp_in.json",Ze="/tmp/mcp_out.json",mt="/tmp/mcp_ctl.json",Ot="/tmp/mcp_status.json";function nn(e,t){if(!e||!t)return{error:"URL and token are required"};let n;try{n=new URL(e)}catch{return{error:"invalid URL"}}return!(n.protocol==="ws:"&&(n.hostname==="127.0.0.1"||n.hostname==="localhost"))&&n.protocol!=="wss:"?{error:"only ws://localhost or wss:// allowed"}:{url:n.toString(),token:t}}function Mn(e){const t=nn(e.get("mcp"),e.get("mcptoken"));return t.error?(e.get("mcp")&&console.warn("MCP: "+t.error),null):t}const on=String.raw`
import bpy, os, json, io, contextlib, traceback
_IN, _OUT = '/tmp/mcp_in.json', '/tmp/mcp_out.json'
_ns = {'bpy': bpy, '__name__': 'mcp_exec'}
def _obj_info(o):
    d = {'name': o.name, 'type': o.type, 'location': list(o.location), 'rotation_euler': list(o.rotation_euler),
         'scale': list(o.scale), 'dimensions': list(o.dimensions), 'visible': o.visible_get(),
         'parent': o.parent.name if o.parent else None,
         'materials': [s.material.name for s in o.material_slots if s.material]}
    if o.type == 'MESH':
        m = o.data
        d['mesh'] = {'vertices': len(m.vertices), 'edges': len(m.edges), 'polygons': len(m.polygons)}
    return d
def _handle(cmd, p):
    if cmd == 'get_scene_info':
        sc = bpy.context.scene
        return {'name': sc.name, 'frame': sc.frame_current, 'object_count': len(sc.objects),
                'active_object': bpy.context.view_layer.objects.active.name if bpy.context.view_layer.objects.active else None,
                'objects': [{'name': o.name, 'type': o.type, 'location': [round(v, 3) for v in o.location]} for o in list(sc.objects)[:50]]}
    if cmd == 'get_object_info':
        o = bpy.data.objects.get(p['name'])
        if o is None: raise ValueError('Object not found: ' + p['name'])
        return _obj_info(o)
    if cmd == 'execute_blender_code':
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            exec(p['code'], _ns)
        return buf.getvalue()
    raise ValueError('unknown command ' + cmd)
def _mcp_tick():
    if os.path.exists(_IN):
        try:
            with open(_IN) as f: req = json.load(f)
            os.remove(_IN)
            try: res = {'result': _handle(req['cmd'], req.get('params') or {})}
            except Exception: res = {'error': traceback.format_exc(limit=3)}
            with open(_OUT + '.tmp', 'w') as f: json.dump(res, f)
            os.replace(_OUT + '.tmp', _OUT)
        except Exception as e: print('MCP tick error', e)
    return 0.15
`,An=String.raw`
bpy.app.timers.register(_mcp_tick, first_interval=1.0, persistent=True)
print('MCP python ready')
`,Cn=String.raw`bl_info = {"name": "Blender Web MCP", "author": "blender-wasm", "version": (0, 1, 0), "blender": (5, 0, 0),
            "category": "System", "description": "Let an AI client (Claude etc.) drive this browser Blender through a local relay"}
`,Un=String.raw`
_CTL, _ST = '/tmp/mcp_ctl.json', '/tmp/mcp_status.json'
def _status():
    try:
        with open(_ST) as f: return json.load(f)
    except Exception: return {'state': 'off', 'msg': ''}
def _send(d):
    with open(_CTL + '.tmp', 'w') as f: json.dump(d, f)
    os.replace(_CTL + '.tmp', _CTL)
class WebMCPPrefs(bpy.types.AddonPreferences):
    bl_idname = __name__
    url: bpy.props.StringProperty(name='Relay URL', default='ws://127.0.0.1:8765')
    token: bpy.props.StringProperty(name='Token', subtype='PASSWORD')
    def draw(self, context):
        l = self.layout; st = _status()
        l.prop(self, 'url'); l.prop(self, 'token')
        row = l.row(); row.operator('webmcp.connect', icon='LINKED'); row.operator('webmcp.disconnect', icon='UNLINKED')
        l.label(text='Status: ' + st.get('state', 'off') + ((' - ' + st['msg']) if st.get('msg') else ''))
        b = l.box()
        b.label(text='1. On your PC run:  node mcp/relay.mjs  (prints the URL and a token)')
        b.label(text='2. Paste URL + token here and press Connect (only ws://localhost or wss:// is allowed)')
        b.label(text='3. Add the relay as an MCP server in your AI client')
        b.label(text='Warning: the AI client can run any Python in this Blender. Keep the token secret.', icon='ERROR')
class WEBMCP_OT_connect(bpy.types.Operator):
    bl_idname = 'webmcp.connect'; bl_label = 'Connect'
    def execute(self, context):
        p = context.preferences.addons[__name__].preferences
        _send({'action': 'connect', 'url': p.url, 'token': p.token})
        return {'FINISHED'}
class WEBMCP_OT_disconnect(bpy.types.Operator):
    bl_idname = 'webmcp.disconnect'; bl_label = 'Disconnect'
    def execute(self, context):
        _send({'action': 'disconnect'})
        return {'FINISHED'}
_last = [None]
def _ui_tick():
    st = _status()
    if st != _last[0]:
        _last[0] = st
        for w in bpy.context.window_manager.windows:
            for a in w.screen.areas: a.tag_redraw()
    return 1.0
_classes = (WebMCPPrefs, WEBMCP_OT_connect, WEBMCP_OT_disconnect)
def register():
    for c in _classes: bpy.utils.register_class(c)
    bpy.app.timers.register(_mcp_tick, first_interval=1.0, persistent=True)
    bpy.app.timers.register(_ui_tick, first_interval=1.0, persistent=True)
def unregister():
    try: _send({'action': 'disconnect'})
    except Exception: pass
    for f in (_mcp_tick, _ui_tick):
        if bpy.app.timers.is_registered(f): bpy.app.timers.unregister(f)
    for c in reversed(_classes): bpy.utils.unregister_class(c)
`,Bn="blender_web_mcp.py",In=`import bpy, os, json, sys
try:
    _d = bpy.utils.user_resource('SCRIPTS', path='addons', create=True)
    with open(os.path.join(_d, ${JSON.stringify(Bn)}), 'w') as _f: _f.write(json.loads(${JSON.stringify(JSON.stringify(Cn+on+Un))}))
    if _d not in sys.path: sys.path.append(_d)
except Exception as _e: print('MCP add-on install failed', _e)
`;function Nn(e){return[...e?["--python-expr",on+An]:[],"--python-expr",In]}function zn(e,t,n){const o=()=>window.Module&&window.Module.FS;let r=Promise.resolve();const i=v=>new Promise(U=>setTimeout(U,v)),c=async(v,U)=>{const A=o();try{A.unlink(Ze)}catch{}A.writeFile(On,JSON.stringify({cmd:v,params:U}));for(let z=0;z<400;z++)if(await i(150),A.analyzePath(Ze).exists){const ne=JSON.parse(new TextDecoder().decode(A.readFile(Ze)));if(A.unlink(Ze),ne.error)throw new Error(ne.error);return ne.result}throw new Error("Blender Python did not answer")},u=v=>new Promise((U,A)=>requestAnimationFrame(async()=>{try{const z=await createImageBitmap(t),ne=Math.min(1,v/Math.max(z.width,z.height)),Q=document.createElement("canvas");Q.width=Math.round(z.width*ne),Q.height=Math.round(z.height*ne),Q.getContext("2d").drawImage(z,0,0,Q.width,Q.height),U({png_base64:Q.toDataURL("image/png").split(",")[1],width:Q.width,height:Q.height})}catch(z){A(z)}}));let b=null,p=null,_=null;const w=(v,U="")=>{try{try{o().unlink(Ot)}catch{}o().writeFile(Ot,JSON.stringify({state:v,msg:U}))}catch{}},f=()=>{if(!b)return;w("connecting");const v=new WebSocket(b.url+(b.url.includes("?")?"&":"?")+"token="+encodeURIComponent(b.token));p=v,v.onopen=()=>{w("connected"),n("MCP: connected to relay")},v.onerror=()=>{p===v&&w("error","relay not reachable or wrong token (retrying)")},v.onclose=()=>{p===v&&(p=null,b&&(_=setTimeout(f,3e3)))},v.onmessage=U=>{const A=JSON.parse(U.data);r=r.then(async()=>{try{const z=A.cmd==="get_viewport_screenshot"?await u(A.params.max_size):await c(A.cmd,A.params);v.send(JSON.stringify({id:A.id,result:z}))}catch(z){v.send(JSON.stringify({id:A.id,error:String(z.message||z)}))}})}},x=()=>{b=null,clearTimeout(_);const v=p;if(p=null,v)try{v.close()}catch{}w("off")},B=v=>{x(),b=v,f()};return setInterval(()=>{const v=o();if(!v||!v.analyzePath(mt).exists)return;let U;try{U=JSON.parse(new TextDecoder().decode(v.readFile(mt))),v.unlink(mt)}catch{return}if(U.action==="disconnect")x();else if(U.action==="connect"){const A=nn(U.url,U.token);A.error?(x(),w("error",A.error)):B(A)}},500),e&&B(e),{connect:B,disconnect:x}}const Mt=350,At=8,Dn=500,jn=6,Ct=10,Fn=60,Kn=120,Wn=210;function Gn(e){const t=new URLSearchParams(location.search),n={shift:!1,ctrl:!1,alt:!1};let o=()=>{};const r=new Map;window.__touchDebug=()=>({mode:d,pointers:[...r.keys()],modalArmed:u});let i="mouse";for(const a of["pointerdown","pointermove"])addEventListener(a,s=>{i=s.pointerType,s.pointerType!=="mouse"&&document.pointerLockElement&&document.exitPointerLock()},!0);const c=Element.prototype.requestPointerLock;c&&(Element.prototype.requestPointerLock=function(...a){if(i==="mouse")try{const s=c.apply(this,a);return s&&s.catch&&s.catch(()=>{}),s}catch{return}});let u=!1,b=!1,p=1,_=!1;window.addEventListener("keydown",a=>{!a.isTrusted||a.ctrlKey||a.metaKey||a.altKey||(a.code==="Escape"||a.code==="Enter"?_=!1:/^Key[FGRSE]$/.test(a.code)&&!/^(INPUT|TEXTAREA)$/.test(a.target.tagName||"")&&(_=!0))},!0);let w=0,f=0;e.addEventListener("mousemove",a=>{a.isTrusted&&(w=a.clientX,f=a.clientY)},!0);let x=!1,B=null;const v=t.has("movecap")?+t.get("movecap"):33;let U=null,A=0,z=0;const ne=()=>{if(A=0,!U)return;const a=U;U=null,z=performance.now(),h("mousemove",a.x,a.y,0,a.buttons,{},!0)},Q=(a,s,l)=>{if(!v){h("mousemove",a,s,0,l);return}U={x:a,y:s,buttons:l},A||(A=setTimeout(ne,Math.max(0,v-(performance.now()-z))))};let xe=null,ge=0;const m=()=>{clearTimeout(ge),ge=0;const a=xe;xe=null,a&&h("mousemove",a.x,a.y,0,a.buttons,{},!1,!0)},h=(a,s,l,E,M,R={},I=!1,se=!1)=>{if(U&&!I&&(clearTimeout(A),A=0,a==="mousemove"?U=null:ne()),ge&&!se){if(a==="mousemove"){xe={x:s,y:l,buttons:M};return}m()}w=s,f=l,e.dispatchEvent(new MouseEvent(a,{bubbles:!0,cancelable:!0,view:window,clientX:s,clientY:l,button:E,buttons:M,shiftKey:!x&&n.shift||!!R.shift,ctrlKey:!x&&n.ctrl||!!R.ctrl,altKey:!x&&n.alt}))},O=(a,s,l)=>{h("mousemove",a,s,0,0),setTimeout(()=>h("mousedown",a,s,l,1<<l),20),setTimeout(()=>h("mouseup",a,s,l,0),90)},P=(a,s)=>{const l=window.Module&&window.Module._blender_web_pen;l&&l(a?1:0,a&&s.pressure||0,(s.tiltX||0)/90,(s.tiltY||0)/90)},Y=(a,s)=>{const l=window.Module;if(!l||!l._blender_web_viewport_rects||!l.HEAPU8)return!0;const E=new Int32Array(l.HEAPU8.buffer,l._blender_web_viewport_rects(),33),M=E[0];if(M===0)return!0;if(l._blender_web_viewport_holes){const R=new Int32Array(l.HEAPU8.buffer,l._blender_web_viewport_holes(),33);for(let I=0;I<R[0];I++)if(a>=R[1+4*I]&&s>=R[2+4*I]&&a<=R[3+4*I]&&s<=R[4+4*I])return!1}for(let R=0;R<M;R++)if(a>=E[1+4*R]&&s>=E[2+4*R]&&a<=E[3+4*R]&&s<=E[4+4*R])return!0;return!1};let q="view",d="idle",H=0,K=!1,k=null;const pe=()=>{const a=[...r.values()];return{x:a.reduce((s,l)=>s+l.x,0)/a.length,y:a.reduce((s,l)=>s+l.y,0)/a.length}},ue=()=>{const[a,s]=[...r.values()];return Math.hypot(a.x-s.x,a.y-s.y)},ye=()=>{if(k&&k.kind){const a=k.kind==="zoom"?{ctrl:!0}:{shift:q==="view"};h("mouseup",k.ax,k.ay,1,0,a),h("mousemove",k.ax,k.ay,0,0)}k=null};e.addEventListener("pointerdown",a=>{if(a.pointerType==="mouse")return;if(a.preventDefault(),e.setPointerCapture(a.pointerId),r.set(a.pointerId,{x:a.clientX,y:a.clientY,type:a.pointerType,x0:a.clientX,y0:a.clientY,t0:performance.now()}),a.pointerType==="pen"&&(_||u)&&!b&&Y(a.clientX,a.clientY)){d="penmodal",P(!0,a),h("mousemove",a.clientX,a.clientY,0,0);return}if(a.pointerType==="pen"){d="pen",P(!0,a),h("mousemove",a.clientX,a.clientY,0,0),h("mousedown",a.clientX,a.clientY,a.button>0?a.button:0,1<<(a.button>0?a.button:0));return}const s=[...r.values()].filter(l=>l.type==="touch");if(s.length===1&&d==="idle"&&u&&Y(a.clientX,a.clientY)){d="pad",x=!0,B={bx:w,by:f,px:a.clientX,py:a.clientY,down:!1},b&&(h("mousemove",w,f,0,0),B.down=!0,setTimeout(()=>{d==="pad"&&h("mousedown",w,f,0,1)},20));return}if(s.length===1&&d==="idle")d="pending",K=!1,q=Y(a.clientX,a.clientY)?"view":"ui",q==="view"&&(h("mousemove",a.clientX,a.clientY,0,0),setTimeout(()=>{d==="pending"&&h("mousemove",a.clientX,a.clientY,0,0)},35)),clearTimeout(H),H=setTimeout(()=>{const l=[...r.values()][0];d==="pending"&&l&&(K=!0,O(l.x,l.y,2))},Dn);else if(s.length===2&&(d==="pending"||d==="orbit"||d==="uidrag")){if(clearTimeout(H),d==="orbit"||d==="uidrag"){const E=[...r.values()][0];h("mouseup",E.x,E.y,d==="uidrag"?0:1,0,{})}const l=pe();q=Y(l.x,l.y)?"view":"ui",k={d0:ue(),cx0:l.x,cy0:l.y,kind:null,ax:l.x,ay:l.y,dragY:l.y},d="two"}else s.length>=3&&(clearTimeout(H),d==="two"&&ye(),d="ignore")},{passive:!1}),e.addEventListener("pointermove",a=>{if(a.pointerType==="mouse")return;a.preventDefault();const s=r.get(a.pointerId);if(a.pointerType==="pen"){s&&(s.x=a.clientX,s.y=a.clientY),P(d==="pen"||d==="penmodal",a),h("mousemove",a.clientX,a.clientY,0,d==="pen"?1:0);return}if(s){if(s.x=a.clientX,s.y=a.clientY,d==="pad"){Q(B.bx+(s.x-B.px),B.by+(s.y-B.py),B.down?1:0);return}if(d==="pending"){if(Math.hypot(s.x-s.x0,s.y-s.y0)>jn&&(q!=="view"||performance.now()-s.t0>=80)){clearTimeout(H);const l=q==="view"&&window.Module&&window.Module._blender_web_gizmo_hot&&window.Module._blender_web_gizmo_hot()===1,E=q==="ui"||l;d=E?"uidrag":"orbit",h("mousemove",s.x0,s.y0,0,0),h("mousedown",s.x0,s.y0,E?0:1,E?1:4),ge=setTimeout(m,Fn),h("mousemove",s.x,s.y,0,E?1:4)}}else if(d==="orbit")h("mousemove",s.x,s.y,0,4);else if(d==="uidrag")h("mousemove",s.x,s.y,0,1);else if(d==="two"&&k&&r.size===2){const l=pe(),E=ue();if(k.kind)if(k.kind==="zoom"){const M=Math.log(E/k.d0),R=k.ay-(M>0?Kn:Wn)*M;h("mousemove",k.ax,R,0,4,{ctrl:!0})}else h("mousemove",l.x,l.y,0,4,{shift:q==="view"});else{const M=Math.abs(E-k.d0),R=Math.hypot(l.x-k.cx0,l.y-k.cy0);if(M>Ct||R>Ct){k.kind=M>R?"zoom":"pan",k.ax=l.x,k.ay=l.y,k.dragY=l.y,k.d0=E,k.cx0=l.x,k.cy0=l.y;const I=k.kind==="zoom"?{ctrl:!0}:{shift:q==="view"};h("mousemove",l.x,l.y,0,0,I),h("mousedown",l.x,l.y,1,4,I)}}}}},{passive:!1});const me=a=>{if(a.pointerType==="mouse")return;a.preventDefault();const s=r.get(a.pointerId);r.delete(a.pointerId);try{e.releasePointerCapture(a.pointerId)}catch{}if(a.pointerType==="pen"){if(d==="penmodal"){const l=s?s.x:a.clientX,E=s?s.y:a.clientY;P(!1,a),O(l,E,0),_=!1,u=!1,b=!1,o(),d=r.size?"ignore":"idle"}else d==="pen"&&(h("mouseup",s?s.x:a.clientX,s?s.y:a.clientY,0,0),P(!1,a),d=r.size?"ignore":"idle");return}d==="pad"&&B&&B.down?(h("mouseup",w,f,0,0),u=!1,b=!1,o(),d="idle",setTimeout(()=>{d!=="pad"&&(x=!1)},150)):d==="pad"?(s&&performance.now()-s.t0<Mt&&Math.hypot(s.x-s.x0,s.y-s.y0)<At&&(O(w,f,0),--p<=0&&(u=!1,o())),d="idle",setTimeout(()=>{d!=="pad"&&(x=!1)},150)):d==="pending"?(clearTimeout(H),s&&!K&&performance.now()-s.t0<Mt&&Math.hypot(s.x-s.x0,s.y-s.y0)<At&&O(s.x0,s.y0,0),d="idle"):d==="orbit"?(h("mouseup",s?s.x:a.clientX,s?s.y:a.clientY,1,0),d="idle"):d==="uidrag"?(h("mouseup",s?s.x:a.clientX,s?s.y:a.clientY,0,0),d="idle"):d==="two"?(ye(),d=r.size?"ignore":"idle"):r.size===0&&(d="idle"),r.size===0&&(d="idle")};e.addEventListener("pointerup",me,{passive:!1}),e.addEventListener("pointercancel",me,{passive:!1});for(const a of["touchstart","touchmove","touchend","touchcancel"])e.addEventListener(a,s=>s.preventDefault(),{passive:!1});const Ue={" ":"Space","-":"Minus",_:"Minus","=":"Equal","+":"Equal","[":"BracketLeft","{":"BracketLeft","]":"BracketRight","}":"BracketRight","\\":"Backslash","|":"Backslash",";":"Semicolon",":":"Semicolon","'":"Quote",'"':"Quote","`":"Backquote","~":"Backquote",",":"Comma","<":"Comma",".":"Period",">":"Period","/":"Slash","?":"Slash"},Be={Tab:"Tab",Enter:"Enter",Escape:"Escape",Backspace:"Backspace",Delete:"Delete",ArrowLeft:"ArrowLeft",ArrowRight:"ArrowRight",ArrowUp:"ArrowUp",ArrowDown:"ArrowDown",Home:"Home",End:"End"},ke={"!":"1","@":"2","#":"3",$:"4","%":"5","^":"6","&":"7","*":"8","(":"9",")":"0"},Ie=a=>Be[a]?Be[a]:a.length!==1?"":/[a-z]/i.test(a)?"Key"+a.toUpperCase():/[0-9]/.test(a)?"Digit"+a:ke[a]?"Digit"+ke[a]:Ue[a]||"",Ne=a=>{if(a.code||a.__fixed||!a.key)return;const s=Ie(a.key);if(!s)return;a.stopImmediatePropagation(),a.preventDefault();const l=new KeyboardEvent(a.type,{code:s,key:a.key,bubbles:!0,cancelable:!0,repeat:a.repeat,shiftKey:a.shiftKey,ctrlKey:a.ctrlKey,altKey:a.altKey});l.__fixed=!0,window.dispatchEvent(l)};window.addEventListener("keydown",Ne,!0),window.addEventListener("keyup",Ne,!0),window.__touchCodeFromKey=Ie;const Te=[],y=()=>{let a=document.getElementById("kbd-input");a||(a=document.createElement("input"),a.id="kbd-input",a.type="text",a.autocapitalize="off",a.autocomplete="off",a.autocorrect="off",a.spellcheck=!1,a.style.cssText="position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:.01;font-size:16px;border:0;padding:0;z-index:95",document.body.appendChild(a),window.addEventListener("keydown",s=>{document.activeElement===a&&s.key&&[...s.key].length===1&&Te.push(s.key)},!0),a.addEventListener("input",s=>{const l=(s.inputType==="insertText"||s.inputType==="insertReplacementText")&&s.data||"";for(const E of l){const M=Te.indexOf(E);if(M>=0){Te.splice(0,M+1);continue}for(const R of["keydown","keyup"])window.dispatchEvent(new KeyboardEvent(R,{key:E,code:"",bubbles:!0,cancelable:!0}))}Te.length=0,a.value=""})),a.focus({preventScroll:!0})};let g=!1;const T=()=>{const a=window.Module,s=a&&(a.calledRun||window.__rtInit)&&a._blender_web_text_editing;return s?s()===1:!1},F=()=>{const a=performance.now(),s=()=>{const l=T();if(l&&!g)g=!0,y();else if(!l&&g){g=!1;const E=document.getElementById("kbd-input");E&&E.blur()}performance.now()-a<950&&setTimeout(s,40)};setTimeout(s,40)};window.__touchTextEditing=T,e.addEventListener("pointerup",a=>{a.pointerType!=="mouse"&&!t.get("autokbd")?.startsWith("0")&&F()},!0);const C=()=>{if(document.hidden||g||window.Module&&T())return;const a=document.activeElement;if(!(a===e||a&&a!==document.body&&a.id!=="kbd-input"&&/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(a.tagName))){a&&a.id==="kbd-input"&&a.blur();try{e.focus({preventScroll:!0})}catch{}}};document.addEventListener("visibilitychange",()=>{document.hidden||setTimeout(C,50)}),window.addEventListener("pageshow",()=>setTimeout(C,50)),window.addEventListener("focus",()=>setTimeout(C,50)),e.addEventListener("pointerdown",()=>setTimeout(C,0),!0),setInterval(()=>{if(g&&!T()){g=!1;const a=document.getElementById("kbd-input");a&&a.blur()}},500);const $=(a,s,l,E)=>{let M=[];try{M=a.readdir(s)}catch{return}for(const R of M){if(R==="."||R==="..")continue;const I=(s==="/"?"":s)+"/"+R;let se;try{se=a.stat(I)}catch{continue}(se.mode&61440)===16384?l>0&&$(a,I,l-1,E):/(\.index\.json$|\/\.)/.test(I)||E.push({path:I,size:se.size,mtime:se.mtime})}},oe=()=>{const a=window.Module;if(!a||!a.FS)return;const s=document.createElement("div");s.style.cssText="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font:15px system-ui,sans-serif;color:#ddd";const l=document.createElement("div");l.style.cssText="width:560px;max-width:92vw;max-height:80vh;overflow:auto;padding:18px;border-radius:12px;background:#1c1c1c;border:1px solid #555",s.appendChild(l);const E=()=>{const M=[];for(const ae of["/uploads","/opfs/home","/home","/tmp","/exports"])$(a.FS,ae,4,M);M.sort((ae,De)=>De.mtime-ae.mtime),l.innerHTML="<div style='font-size:18px;font-weight:600;margin-bottom:10px'>Soubory</div><div style='color:#aaa;margin-bottom:12px;line-height:1.4'>Nahraj soubory pro File ▸ Import (jsou v /uploads) a stáhni to, co Blender uložil/exportoval.</div>";const R=document.createElement("button");R.textContent="⬆ Nahrát soubory…",R.style.cssText="padding:10px 16px;border:0;border-radius:8px;background:#e87d0d;color:#111;font:600 15px system-ui;margin-right:8px";const I=document.createElement("input");I.type="file",I.multiple=!0,I.style.display="none",R.onclick=()=>I.click(),I.onchange=async()=>{try{a.FS.mkdir("/uploads")}catch{}for(const ae of I.files)a.FS.writeFile("/uploads/"+ae.name,new Uint8Array(await ae.arrayBuffer()));E()};const se=document.createElement("button");se.textContent="Zavřít",se.style.cssText="padding:10px 16px;border:0;border-radius:8px;background:#333;color:#ddd;font:15px system-ui",se.onclick=()=>s.remove(),l.append(R,I,se);const ze=document.createElement("div");ze.style.marginTop="14px",M.length||(ze.innerHTML="<div style='color:#888'>Zatím žádné soubory (ulož/exportuj něco v Blenderu).</div>");for(const ae of M){const De=document.createElement("div");De.style.cssText="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #333";const ut=document.createElement("div");ut.style.cssText="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap",ut.textContent=ae.path+"  ("+(ae.size/1024).toFixed(0)+" KB)";const Je=document.createElement("button");Je.textContent="⬇",Je.style.cssText="padding:6px 14px;border:0;border-radius:6px;background:#2a6fd6;color:#fff;font:15px system-ui",Je.onclick=()=>{const Ln=a.FS.readFile(ae.path),je=document.createElement("a");je.href=URL.createObjectURL(new Blob([Ln],{type:"application/octet-stream"})),je.download=ae.path.split("/").pop(),document.body.appendChild(je),je.click(),je.remove()},De.append(ut,Je),ze.appendChild(De)}l.appendChild(ze)};E(),s.addEventListener("click",M=>{M.target===s&&s.remove()}),document.body.appendChild(s)};if(window.__openFileManager=oe,!(t.get("touch")==="1"||t.get("touch")!=="0"&&(navigator.maxTouchPoints||0)>0))return;const ee=[["Esc","Escape","Escape"],["Enter","Enter","Enter"],["Tab","Tab","Tab"],["A","KeyA","a"],["G","KeyG","g"],["R","KeyR","r"],["S","KeyS","s"],["X","KeyX","x"],["Y","KeyY","y"],["Z","KeyZ","z"],["Del","Delete","Delete"],["1","Digit1","1"],["2","Digit2","2"],["3","Digit3","3"],["⌂","Home","Home"]],W=[["Shift","shift","ShiftLeft"],["Ctrl","ctrl","ControlLeft"],["Alt","alt","AltLeft"]],J=(a,s,l)=>window.dispatchEvent(new KeyboardEvent(a,{code:s,key:l,bubbles:!0,cancelable:!0})),Xe=new Set(["KeyG","KeyR","KeyS","KeyE","KeyB","KeyK"]),ve=(a,s)=>{a==="KeyR"&&n.ctrl?(u=!0,p=2,o()):a==="KeyK"&&!n.ctrl?(u=!0,p=1e9,o()):a==="KeyB"&&!n.ctrl?(u=!0,b=!0,p=1,o()):Xe.has(a)&&!n.ctrl&&!n.shift&&!n.alt?(u=!0,p=1,o()):(a==="Enter"||a==="Escape"||a==="Tab")&&(u=!1,b=!1,o());const l=s.length===1&&n.shift?s.toUpperCase():s;J("keydown",a,l),setTimeout(()=>J("keyup",a,l),40)},pt=(a,s,l)=>{a.forEach(([E,M])=>J("keydown",E,M)),J("keydown",s,l),setTimeout(()=>{J("keyup",s,l),a.forEach(([E,M])=>J("keyup",E,M))},60)},ce=document.createElement("div");ce.id="touchbar",o=()=>{ce.style.borderColor=u?"#2a6fd6":"#555",ce.style.boxShadow=u?"0 0 0 2px #2a6fd6":"none"},ce.style.cssText="position:fixed;left:0;right:0;margin:0 auto;width:fit-content;bottom:30px;z-index:90;display:flex;gap:4px;padding:4px;background:rgba(28,28,28,.88);border:1px solid #555;border-radius:10px;font:600 14px system-ui,sans-serif;-webkit-user-select:none;user-select:none;touch-action:manipulation;flex-wrap:wrap;max-width:98vw;justify-content:center";const he=(a,s)=>{const l=document.createElement("button");return l.textContent=a,l.style.cssText="min-width:38px;height:36px;padding:0 6px;border-radius:7px;border:1px solid #666;background:#3a3a3a;color:#eee;font:inherit;touch-action:manipulation",l.addEventListener("pointerdown",E=>E.preventDefault()),l.addEventListener("click",s),ce.appendChild(l),l};ee.forEach(([a,s,l])=>he(a,()=>ve(s,l))),he("↶",()=>pt([["ControlLeft","Control"]],"KeyZ","z")).title="Undo (Ctrl+Z)",he("↷",()=>pt([["ControlLeft","Control"],["ShiftLeft","Shift"]],"KeyZ","z")).title="Redo (Ctrl+Shift+Z)",W.forEach(([a,s,l])=>{const E=he(a,()=>{n[s]=!n[s],E.style.background=n[s]?"#2a6fd6":"#3a3a3a",J(n[s]?"keydown":"keyup",l,a)})});const Tn=[["E","KeyE","e"],["F","KeyF","f"],["B","KeyB","b"],["C","KeyC","c"],["D","KeyD","d"],["H","KeyH","h"],["I","KeyI","i"],["K","KeyK","k"],["M","KeyM","m"],["N","KeyN","n"],["P","KeyP","p"],["T","KeyT","t"],["Q","KeyQ","q"],["W","KeyW","w"],["Space","Space"," "],["⌫","Backspace","Backspace"],["F2","F2","F2"],["F3","F3","F3"],[".","Period","."],["-","Minus","-"],["/","Slash","/"]],Se=document.createElement("div");Se.id="touchbar-more",Se.style.cssText="display:none;flex-basis:100%;flex-wrap:wrap;gap:4px;justify-content:center";const Lt=(a,s)=>{const l=document.createElement("button");return l.textContent=a,l.style.cssText="min-width:38px;height:36px;padding:0 6px;border-radius:7px;border:1px solid #666;background:#3a3a3a;color:#eee;font:inherit;touch-action:manipulation",l.addEventListener("pointerdown",E=>E.preventDefault()),l.addEventListener("click",s),Se.appendChild(l),l};Tn.forEach(([a,s,l])=>Lt(a,()=>ve(s,l))),Lt("💾",()=>pt([["ControlLeft","Control"]],"KeyS","s")).title="Uložit (Ctrl+S)";const Sn=he("⋯",()=>{Se.style.display=Se.style.display==="none"?"flex":"none"});Sn.title="Další klávesy (E, Space, F2, Ctrl+S…)",he("📁",oe).title="Soubory: nahrát / stáhnout",he("⌨",y).title="Klávesnice (psaní do polí, přejmenování)";const Pn=he("✕",()=>ce.remove());Pn.title="Skrýt lištu",ce.appendChild(Se),ce.style.display="none",document.body.appendChild(ce);const Rn=setInterval(()=>{window.__BGUI__&&window.__BGUI__.window&&(ce.style.display="flex",clearInterval(Rn))},300)}new URLSearchParams(location.search).get("tel");Math.random().toString(36).slice(2,8);performance.now();const an=["ws","edit","sculpt","texpaint","gn","files","export","rigify","gp"],st=new URLSearchParams(location.search),$n=(st.get("tourpart")||an.join(",")).split(","),rn=e=>(st.get(e)||"").split(",").filter(Boolean),Ut=rn("tourws"),Hn=rn("tourskip"),Vn=+st.get("tourrep")||1,Bt=Math.max(0,+st.get("tourwait")||0),Yn=`
import json
_G = globals()
def _view():
    w = bpy.context.window_manager.windows[0]
    for a in w.screen.areas:
        if a.type == 'VIEW_3D': return w, a, [r for r in a.regions if r.type == 'WINDOW'][0]
    return w, None, None
def _rect():
    w, a, r = _view()
    return [r.x, w.height - r.y - r.height, r.width, r.height] if a else None
def _px(co):
    from bpy_extras import view3d_utils
    w, a, r = _view(); p = view3d_utils.location_3d_to_region_2d(r, a.spaces[0].region_3d, co)
    return None if p is None else [r.x + p.x, w.height - (r.y + p.y)]
def _shade(t):
    w, a, r = _view()
    if a: a.spaces[0].shading.type = t
    return bool(a)
def _state():
    o = bpy.context.view_layer.objects.active; s = {'mode': bpy.context.mode, 'objs': len(bpy.data.objects), 'ws': bpy.context.window_manager.windows[0].workspace.name}
    if o:
        s.update(ob=o.name, type=o.type)
        if o.type == 'MESH':
            if o.mode == 'EDIT': o.update_from_editmode()
            s.update(v=len(o.data.vertices), zsum=round(sum(x.co.z for x in o.data.vertices), 4))
    return s
def _tour_tick():
    if os.path.exists('/tmp/tour_cmd'):
        s = open('/tmp/tour_cmd').read(); os.remove('/tmp/tour_cmd'); out = None
        try:
            if s.startswith('eval:'): out = eval(s[5:], _G)
            else: exec(s, _G)
        except Exception as e: out = {'err': repr(e)}
        _say('AUTO_TOUR_R ' + json.dumps(out))
    return 0.05
bpy.app.timers.register(_tour_tick, first_interval=0.5, persistent=True)
_gated(lambda: _say('AUTO_TOUR_READY'))`,S=e=>new Promise(t=>setTimeout(t,e)),yt=()=>document.getElementById("canvas"),It=()=>window.__DPR__||1,re=(e,t,n,o=0,r=0)=>{const i=yt().getBoundingClientRect();yt().dispatchEvent(new MouseEvent(e,{bubbles:!0,cancelable:!0,view:window,clientX:i.left+t/It(),clientY:i.top+n/It(),button:o,buttons:r}))},qn=e=>/^[a-z]$/.test(e)?["Key"+e.toUpperCase(),e]:/^[0-9]$/.test(e)?["Digit"+e,e]:[e,e],Pe=(e,t,n,o={})=>window.dispatchEvent(new KeyboardEvent(e,{code:t,key:n,bubbles:!0,cancelable:!0,ctrlKey:!!o.ctrl,shiftKey:!!o.shift})),te=async(e,t={},n=400)=>{const[o,r]=qn(e);t.ctrl&&Pe("keydown","ControlLeft","Control",{ctrl:!0}),t.shift&&Pe("keydown","ShiftLeft","Shift",t),Pe("keydown",o,r,t),await S(40),Pe("keyup",o,r,t),t.shift&&Pe("keyup","ShiftLeft","Shift",{ctrl:t.ctrl}),t.ctrl&&Pe("keyup","ControlLeft","Control"),await S(n)},Qe=async(e,t,n,o,r=16)=>{re("mousemove",e,t),await S(200),re("mousedown",e,t,0,1),await S(60);for(let i=1;i<=r;i++)re("mousemove",e+(n-e)*i/r,t+(o-t)*i/r,0,1),await S(30);re("mouseup",n,o,0,0),await S(800)},ft=async(e,t)=>{re("mousemove",e,t),await S(250),re("mousedown",e,t,0,1),await S(70),re("mouseup",e,t,0,0),await S(500)};let Re=null;function Xn(e){Re&&Re(JSON.parse(e))}const Nt=24e4,D=e=>new Promise((t,n)=>{const o=setTimeout(()=>{Re=null,clearInterval(i),n(new Error("HANG: Python neodpověděl do "+Nt/1e3+" s"))},Nt),r=performance.now(),i=setInterval(()=>{window.__GPU_LOST__&&performance.now()-r>15e3&&(clearTimeout(o),clearInterval(i),Re=null,n(new Error("HANG: Python po ztrátě GPU neodpověděl do 15 s")))},1e3);Re=u=>{clearTimeout(o),clearInterval(i),Re=null,u&&u.err?n(new Error(u.err)):t(u)};const c=window.Module.FS;try{c.unlink("/tmp/tour_cmd")}catch{}c.writeFile("/tmp/tour_cmd",e)}),N=e=>D("eval:"+e),Jn=async(e=1500)=>{await N("0"),await S(e),await N("0")},ie=(e,t)=>{if(!e)throw new Error(t)};async function Zn(){const e=await N("_rect()").catch(()=>null);return new Promise(t=>requestAnimationFrame(async()=>{try{const n=await createImageBitmap(yt()),o=256/Math.max(n.width,n.height),r=document.createElement("canvas");r.width=Math.round(n.width*o),r.height=Math.round(n.height*o);const i=r.getContext("2d",{willReadFrequently:!0});i.drawImage(n,0,0,r.width,r.height);const c=e?e.map(f=>Math.round(f*o)):[0,0,r.width,r.height],u=i.getImageData(c[0],c[1],Math.max(1,c[2]),Math.max(1,c[3])).data;let b=0,p=0,_=0;for(let f=0;f<u.length;f+=4){const x=(u[f]+u[f+1]+u[f+2])/3;b+=x,p+=x*x,_++}const w=Math.sqrt(Math.max(0,p/_-b/_*(b/_)));t({url:r.toDataURL("image/jpeg",.6),std:Math.round(w*10)/10,blank:w<1})}catch(n){t({url:"",std:-1,blank:!0,err:String(n)})}}))}let He=null,Le=!1,Qn=0;const et=window.__TOUR=[],L=async(e,t,n=1500)=>{if(Le)return;He={errs:[]};const o=performance.now();let r=!0,i="";try{await t(),await Jn(n)}catch(p){r=!1,i=String(p.message||p).slice(0,300),i.startsWith("HANG")&&(Le=!0)}window.__GPU_LOST__&&(r=!1,i="GPU LOST "+window.__GPU_LOST__+(i?" | "+i:""),Le=!0);const c=Math.round(performance.now()-o),u=Le?{url:"",std:-1,blank:!0}:await Zn(),b={i:Qn++,name:e,ok:r,err:i,ms:c,gpuerrs:He.errs.slice(0,4),nerr:He.errs.length,blank:u.blank,std:u.std};et.push(b),console.log("TOUR_STEP "+JSON.stringify(b)),{...b,shot:u.url}},Ee=()=>D("bpy.ops.wm.read_homefile(app_template='', use_factory_startup=True)"),Z=async(e,t)=>{const n=await N("_state()");return ie(e(n),t+" "+JSON.stringify(n)),n},Fe=async()=>{const e=await N("_rect()");return[e[0]+e[2]/2,e[1]+e[3]/2]},Ke=e=>D(`bpy.context.window.workspace = bpy.data.workspaces[${JSON.stringify(e)}]`),eo={ws:async()=>{for(let e=0;e<Vn;e++)for(const t of await N("[w.name for w in bpy.data.workspaces]")){const n=(e?"r"+e+"_":"")+t.replace(/ /g,"_"),o=t.replace(/ /g,"_");if(!(Ut.length&&!Ut.includes(o)||Hn.includes(o))&&(await L("ws_"+n,()=>Ke(t),2500),!!await N("bool(_view()[1])"))){for(const r of["SOLID","MATERIAL","RENDERED","WIREFRAME"])await L(`ws_${n}_${r}`,()=>D(`_shade('${r}')`),r==="MATERIAL"||r==="RENDERED"?4e3:1500);await D("_shade('SOLID')").catch(()=>{})}}await Ke("Layout").catch(()=>{})},edit:async()=>{await L("edit_enter",async()=>{await Ee(),await S(1500);const[e,t]=await Fe();re("mousemove",e,t),await S(300),await te("Tab",{},900),await Z(n=>n.mode==="EDIT_MESH","Tab nepřepnul")}),await L("edit_extrude",async()=>{await D("import bmesh; o=bpy.context.object; b=bmesh.from_edit_mesh(o.data); [f.select_set(False) for f in b.faces]; [e.select_set(False) for e in b.edges]; [v.select_set(False) for v in b.verts]; f=max(b.faces,key=lambda f:f.calc_center_median().z); f.select_set(True); b.select_flush(True); bmesh.update_edit_mesh(o.data)");const[e,t]=await Fe();re("mousemove",e,t),await S(300),await te("e"),await te("1"),await te("Enter",{},900),await Z(n=>n.v===12,"E 1: čekám 12 vrcholů")}),await L("edit_loopcut",async()=>{const e=await N("(lambda o: _px(o.matrix_world @ ((o.data.vertices[max(range(8), key=lambda i: o.data.vertices[i].co.x - o.data.vertices[i].co.y + o.data.vertices[i].co.z)].co + o.data.vertices[max(range(8), key=lambda i: o.data.vertices[i].co.x - o.data.vertices[i].co.y - o.data.vertices[i].co.z)].co) / 2)))(bpy.context.object)");re("mousemove",e[0],e[1]),await S(300),await te("r",{ctrl:!0},900),re("mousemove",e[0]+1,e[1]+1),await S(500),await ft(e[0]+1,e[1]+1),await ft(e[0]+1,e[1]+1),await S(600),await Z(t=>t.v>12,"Ctrl+R: vrcholů má přibýt")}),await L("edit_undo",async()=>{const e=await N("_state()");await te("z",{ctrl:!0},900),await Z(t=>t.v<e.v,"Ctrl+Z nevrátil")}),await L("edit_redo",async()=>{const e=await N("_state()");await te("z",{ctrl:!0,shift:!0},900),await Z(t=>t.v>e.v,"Ctrl+Shift+Z nevrátil")}),await L("edit_exit",async()=>{await te("Tab",{},900),await Z(e=>e.mode==="OBJECT","Tab zpět")})},sculpt:async()=>{let e=0;await L("sculpt_enter",async()=>{await Ee(),await S(1200),await D("bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=1.3)"),await S(600),await Ke("Sculpting"),await S(1500),e=(await Z(t=>t.mode==="SCULPT","workspace Sculpting")).zsum},2500),await L("sculpt_stroke",async()=>{const[t,n]=await Fe();await Qe(t-40,n-30,t+60,n+10),await Z(o=>o.zsum!==e,"tah nezměnil mesh")},2e3),await L("sculpt_undo",async()=>{await te("z",{ctrl:!0},1e3),await Z(t=>t.zsum===e,"Ctrl+Z nevrátil")})},texpaint:async()=>{const e="(lambda p: sum(1 for i in range(0,len(p),4) if p[i]<0.99))(list(bpy.data.images['TOUR'].pixels))";await L("texpaint_enter",async()=>{await Ee(),await S(1200),await D("o=bpy.context.view_layer.objects.active; bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.smart_project(); bpy.ops.object.mode_set(mode='OBJECT'); img=bpy.data.images.new('TOUR',256,256); img.generated_color=(1,1,1,1); m=bpy.data.materials.new('TM'); m.use_nodes=True; n=m.node_tree.nodes.new('ShaderNodeTexImage'); n.image=img; m.node_tree.links.new(n.outputs[0],m.node_tree.nodes['Principled BSDF'].inputs['Base Color']); o.data.materials.clear(); o.data.materials.append(m); m.node_tree.nodes.active=n"),await S(800),await Ke("Texture Paint"),await S(1500),await Z(t=>t.mode==="PAINT_TEXTURE","workspace Texture Paint")},2500),await L("texpaint_stroke",async()=>{await D("bpy.context.tool_settings.image_paint.brush.color=(1,0,0)");const t=await N(e),[n,o]=await Fe();await Qe(n-30,o-20,n+40,o+5);const r=await N(e);ie(r>t,`tah neobarvil pixely (${t} -> ${r})`)},2e3)},gn:async()=>{await L("gn_workspace",async()=>{await Ee(),await S(1200),await Ke("Geometry Nodes")},2500),await L("gn_modifier",async()=>{await D("o=bpy.context.view_layer.objects.active; m=o.modifiers.new('G','NODES'); t=bpy.data.node_groups.new('T','GeometryNodeTree'); t.interface.new_socket('Geometry',in_out='INPUT',socket_type='NodeSocketGeometry'); t.interface.new_socket('Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry'); i=t.nodes.new('NodeGroupInput'); u=t.nodes.new('NodeGroupOutput'); d=t.nodes.new('GeometryNodeDistributePointsOnFaces'); p=t.nodes.new('GeometryNodeInstanceOnPoints'); c=t.nodes.new('GeometryNodeMeshIcoSphere'); r=t.nodes.new('GeometryNodeRealizeInstances'); c.inputs['Radius'].default_value=0.05; d.inputs['Density'].default_value=50; L=t.links.new; L(i.outputs[0],d.inputs['Mesh']); L(d.outputs['Points'],p.inputs['Points']); L(c.outputs['Mesh'],p.inputs['Instance']); L(p.outputs[0],r.inputs[0]); L(r.outputs[0],u.inputs[0]); m.node_group=t"),await S(1500);const e=await N("len(bpy.context.view_layer.objects.active.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices)");ie(e>100,`scatter: ${e} vrcholů`)},2500),await L("gn_MATERIAL",()=>D("_shade('MATERIAL')"),4e3)},files:async()=>{await L("file_save",async()=>{await Ee(),await S(1200),await D("bpy.ops.mesh.primitive_uv_sphere_add(location=(3,0,0))"),await D("bpy.ops.wm.save_as_mainfile(filepath='/opfs/home/tour.blend')"),ie(await N("bpy.data.filepath.endswith('tour.blend')"),"soubor neuložen")}),await L("file_new",async()=>{await Ee(),await S(1500),await Z(e=>e.objs===3,"nový soubor")}),await L("file_reopen",async()=>{await D("bpy.ops.wm.open_mainfile(filepath='/opfs/home/tour.blend')"),await S(2e3),await Z(e=>e.objs===4,"otevřený soubor")})},export:async()=>{await L("export_gltf",async()=>{await D("bpy.ops.export_scene.gltf(filepath='/opfs/home/tour.glb')");const e=await N("os.path.getsize('/opfs/home/tour.glb')");ie(e>100,`glb ${e} B`)})},rigify:async()=>{const e="(lambda ob: (lambda b: (b.name, _px(ob.matrix_world @ ((b.head + b.tail) / 2))))(ob.pose.bones['NAME']))(bpy.context.object)";await L("rigify_generate",async()=>{await Ee(),await S(1200),await D("bpy.ops.preferences.addon_enable(module='rigify'); bpy.ops.object.select_all(action='DESELECT'); bpy.ops.object.armature_human_metarig_add(); bpy.ops.pose.rigify_generate()"),await S(2e3),ie(await N("'rig' in bpy.data.objects or any(o.name.startswith('rig') for o in bpy.data.objects)"),"rig nevznikl")},2500),await L("rigify_pose",async()=>{await D("o=[o for o in bpy.data.objects if o.name.startswith('rig') and o.type=='ARMATURE'][0]; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o; bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='DESELECT')"),await Z(t=>t.mode==="POSE","pose mode")}),await L("rigify_click",async()=>{const t="torso",n=await N(e.replace("NAME",t));ie(n[1],"kost mimo pohled"),await ft(n[1][0],n[1][1]),await S(700);const o=await N("bpy.context.active_pose_bone.name if bpy.context.active_pose_bone else ''");ie(o!=="",`klik na ${t} nevybral nic`)}),await L("rigify_box",async()=>{await D("bpy.ops.pose.select_all(action='DESELECT')");const t=await N("_rect()");re("mousemove",t[0]+t[2]/2,t[1]+t[3]/2),await S(300),await te("b",{},500),await Qe(t[0]+t[2]*.2,t[1]+t[3]*.1,t[0]+t[2]*.8,t[1]+t[3]*.9);const n=await N("len(bpy.context.selected_pose_bones or [])");ie(n>0,"box vybral 0 kostí")})},gp:async()=>{const e="(lambda o: sum(len(d.strokes) for l in o.data.layers for d in [l.current_frame().drawing] if l.current_frame()))(bpy.context.view_layer.objects.active)";let t=0;await L("gp_template",async()=>{await D("bpy.ops.wm.read_homefile(app_template='2D_Animation', use_factory_startup=True)"),await S(5e3),te("Escape"),await S(600),t=await N(e)},2500),await L("gp_stroke",async()=>{const[n,o]=await Fe();await Qe(n-100,o-30,n+100,o+20,20);const r=await N(e);ie(r===t+1,`tah nepřibyl (${t} -> ${r})`)},2e3),await L("gp_SOLID",()=>D("_shade('SOLID')"),2e3),await L("gp_WIREFRAME",()=>D("_shade('WIREFRAME')"),2e3),await L("gp_undo",async()=>{await te("z",{ctrl:!0},900);const n=await N(e);ie(n===t,`Ctrl+Z (${n})`)})}};async function to(){try{new BroadcastChannel("blender-gpuerr").onmessage=n=>{const o=String(n.data);He&&!o.startsWith("PIPE_SPARSE")&&He.errs.push(o.slice(0,200))}}catch{}const e=performance.now();if(await S(1e3),await te("Escape",{},600),Bt)for(let n=0;n<Bt;n+=10)await S(1e4);await L("boot",async()=>{await Z(n=>n.objs===3,"startovní scéna")});for(const n of an)if($n.includes(n)&&!Le)try{await eo[n]()}catch(o){await L(n+"_part",()=>{throw o})}const t=et.filter(n=>!n.ok||n.blank||n.nerr).length;console.log(`TOUR_DONE steps=${et.length} problem=${t} s=${Math.round((performance.now()-e)/1e3)} hung=${Le}`),et.length,Math.round((performance.now()-e)/1e3),window.__AUTO_DONE="tour"}const we=(e,t)=>{e==="auto_done"&&(window.__AUTO_DONE=t.name)},$e=new URLSearchParams(location.search),be=$e.get("auto")||"",fe=`import bpy, sys, os
def _say(s):
    print(s); sys.stdout.flush()
def _v3d():
    for a in bpy.context.window_manager.windows[0].screen.areas:
        if a.type == 'VIEW_3D': return a
def _mp():
    a = _v3d()
    if a: a.spaces[0].shading.type = 'MATERIAL'
    _say('AUTO_STEP mp_on')
    return None
def _gated(fn):                               # čeká na /tmp/auto_go (JS ho zapíše, až je Blender zahřátý)
    def _poll():
        if os.path.exists('/tmp/auto_go'):
            fn(); return None
        return 1.0
    bpy.app.timers.register(_poll, first_interval=1.0)
`,ht={light:fe+`
_n = [0]
def _move():
    L = bpy.data.objects.get('Light')
    if L is None or _n[0] >= 10:
        _say('AUTO_DONE light'); return None
    _n[0] += 1
    L.location.x = 4.0 * (-1 if _n[0] % 2 else 1); L.location.z = 3.0 + 0.4 * _n[0]
    _say('AUTO_STEP light_%d' % _n[0])
    return 1.0
_gated(lambda: (_mp(), bpy.app.timers.register(_move, first_interval=4.0)))`,lightdrag:fe+`
def _sel():
    L = bpy.data.objects.get('Light')
    bpy.ops.object.select_all(action='DESELECT')
    L.select_set(True); bpy.context.view_layer.objects.active = L
    _say('AUTO_STEP light_selected'); _say('AUTO_DRAG_READY')
    return None
_gated(lambda: (_mp(), bpy.app.timers.register(_sel, first_interval=4.0)))`,orbit:fe+`
_gated(lambda: (_mp(), bpy.app.timers.register(lambda: (_say('AUTO_ORBIT_READY'), None)[1], first_interval=4.0)))`,soak:fe+`
import math, time
_t0 = [0.0]; _k = [0]; _p = [0]
def _post():
    a = _v3d()
    if not a: return 2.0
    if _p[0] >= 6:
        _say('AUTO_DONE soak'); return None
    t = 'RENDERED' if _p[0] % 2 == 0 else 'MATERIAL'
    _p[0] += 1
    _say('AUTO_STEP post_shade_%s_%d' % (t, _p[0]))
    a.spaces[0].shading.type = t
    return 15.0
def _soak():
    if not _t0[0]: _t0[0] = time.time()
    el = time.time() - _t0[0]
    if el > float(SOAK_SEC):
        if 'R' in 'SOAK_MODE':
            _say('AUTO_STEP soak_done_switching'); bpy.app.timers.register(_post, first_interval=1.0); return None
        _say('AUTO_DONE soak'); return None
    _k[0] += 1; k = _k[0]
    L = bpy.data.objects.get('Light')
    if L and 'l' in 'SOAK_MODE': L.location.x = 4.0 * math.sin(k / 5.0); L.location.z = 4.0 + math.cos(k / 3.0)
    ob = bpy.data.objects.get('Cube')
    if ob and 'm' in 'SOAK_MODE':
        if not ob.data.materials:
            m = bpy.data.materials.new('SoakMat'); m.use_nodes = True; ob.data.materials.append(m)
        ob.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (abs(math.sin(k / 7.0)), abs(math.cos(k / 11.0)), 0.3, 1.0)
    a = _v3d()
    if a and 'o' in 'SOAK_MODE': a.spaces[0].region_3d.view_rotation.rotate(__import__('mathutils').Euler((0, 0, 0.05)))
    if k % 30 == 0: _say('AUTO_STEP soak_%ds' % int(el))
    return 1.0
_gated(lambda: (_mp(), bpy.app.timers.register(_soak, first_interval=4.0)))`.replace("SOAK_SEC",String(+$e.get("soaksec")||600)).replace("SOAK_MODE",$e.get("soakmode")||"lmo"),ws:fe+`
_ws = [None, 0]
def _next():
    names = [w.name for w in bpy.data.workspaces]
    if _ws[1] >= len(names):
        _say('AUTO_DONE ws'); return None
    n = names[_ws[1]]; _ws[1] += 1
    _say('AUTO_STEP ws_' + n.replace(' ', '_'))        # před přepnutím: když to zamrzne, poslední krok = viník
    bpy.context.window.workspace = bpy.data.workspaces[n]
    return 6.0
_gated(lambda: bpy.app.timers.register(_next, first_interval=2.0))`,tmpl:fe+`
def _load():
    _say('AUTO_STEP tmpl_load_' + 'TMPL_NAME')
    bpy.ops.wm.read_homefile(app_template='TMPL_NAME')
    _say('AUTO_STEP tmpl_loaded')
    bpy.app.timers.register(lambda: (_say('AUTO_DONE tmpl'), None)[1], first_interval=30.0, persistent=True)
    return None
_gated(lambda: bpy.app.timers.register(_load, first_interval=2.0))`.replace("TMPL_NAME",$e.get("tmpl")||"2D_Animation").replace("TMPL_NAME",$e.get("tmpl")||"2D_Animation"),rendered:fe+`
_r = [0]
def _sw():
    a = _v3d()
    if not a: return 2.0
    if _r[0] >= 10:
        _say('AUTO_DONE rendered'); return None
    t = 'RENDERED' if _r[0] % 2 == 0 else 'MATERIAL'
    _r[0] += 1
    _say('AUTO_STEP shade_%s_%d' % (t, _r[0]))
    a.spaces[0].shading.type = t
    return 15.0
_gated(lambda: bpy.app.timers.register(_sw, first_interval=3.0))`,tour:fe+Yn,mp:fe+`
_gated(lambda: (_mp(), bpy.app.timers.register(lambda: (_say('AUTO_DONE mp'), None)[1], first_interval=60.0)))`};function no(){return ht[be]?["--python-expr",ht[be]]:[]}const le=e=>new Promise(t=>setTimeout(t,e)),sn=()=>document.getElementById("canvas"),_e=(e,t,n,o=0,r=0)=>sn().dispatchEvent(new MouseEvent(e,{bubbles:!0,cancelable:!0,view:window,clientX:t,clientY:n,button:o,buttons:r})),nt=(e,t,n)=>window.dispatchEvent(new KeyboardEvent(e,{code:t,key:n,bubbles:!0,cancelable:!0})),kt=()=>{const e=sn().getBoundingClientRect();return[e.left+e.width*.5,e.top+e.height*.45,e]};async function cn(){const[e,t]=kt();_e("mousemove",e,t),await le(200),nt("keydown","Escape","Escape"),await le(50),nt("keyup","Escape","Escape"),await le(400)}async function oo(){const[e,t]=kt();await cn(),_e("mousemove",e,t),await le(300),nt("keydown","KeyG","g"),await le(50),nt("keyup","KeyG","g"),await le(300);for(let n=1;n<=120;n++)_e("mousemove",e+150*Math.sin(n/12),t+100*Math.cos(n/12)),await le(33);_e("mousedown",e,t,0,1),await le(70),_e("mouseup",e,t,0,0),we("auto_step",{name:"drag_done"}),we("auto_done",{name:be})}async function ao(){const[e,t]=kt();await cn(),_e("mousemove",e,t),await le(200),_e("mousedown",e,t,1,4);for(let n=1;n<=150;n++)_e("mousemove",e+200*Math.sin(n/15),t+80*Math.sin(n/7),1,4),await le(33);_e("mouseup",e,t,1,0),we("auto_done",{name:be})}let _t=0,zt=!1;function ro(){if(!ht[be])return;const e=performance.now();let t=9999,n=0;try{new BroadcastChannel("blender-perf").onmessage=r=>{t=r.data.dt_avg_ms,n=performance.now()}}catch{}const o=setInterval(()=>{if(zt){clearInterval(o);return}const r=performance.now()-n<3e3?t:9999;if(_t=window.__BGUI__&&window.__BGUI__.window&&r<150?_t+1:0,_t>=3||performance.now()-e>12e4&&window.__BGUI__&&window.__BGUI__.window)try{window.Module.FS.writeFile("/tmp/auto_go","1"),zt=!0,we("auto_step",{name:"go"})}catch(i){console.log("auto_go failed",i)}},1e3)}function so(e){if(!be||!e.startsWith("AUTO_"))return;const t=e.trim();if(t.startsWith("AUTO_TOUR_R ")){Xn(t.slice(12));return}if(t==="AUTO_TOUR_READY"){to();return}window.__AUTO_LOG=(window.__AUTO_LOG||[]).concat(t),t==="AUTO_DRAG_READY"?oo():t==="AUTO_ORBIT_READY"?ao():t.startsWith("AUTO_DONE")?we("auto_done",{name:be}):we("auto_step",{name:t.slice(10)})}if(be){let e=0;const t=setInterval(()=>{e++;const n=document.getElementById("gpu-ack");n&&!n.checked&&(n.checked=!0,n.dispatchEvent(new Event("change",{bubbles:!0})));const o=document.getElementById("start-btn");o&&!o.disabled?(o.click(),clearInterval(t),we("auto_launch",{})):e>=600?(clearInterval(t),we("auto_launch_fail",{disabled:!!(o&&o.disabled)})):e%30===0&&we("auto_launch_wait",{disabled:!!(o&&o.disabled)})},1e3)}const io=new URLSearchParams(location.search).get("sw")?new URLSearchParams(location.search).get("sw")==="1":!0;io&&"serviceWorker"in navigator&&window.self===window.top&&(navigator.serviceWorker.register("./sw.js").then(async()=>{const e=await navigator.serviceWorker.ready;if(!crossOriginIsolated&&!sessionStorage.getItem("coi_reload")){sessionStorage.setItem("coi_reload","1"),location.reload();return}const t=[location.pathname,...performance.getEntriesByType("resource").map(n=>n.name)];e.active&&e.active.postMessage({type:"precache",urls:t}),navigator.storage&&navigator.storage.persist&&navigator.storage.persist().catch(()=>{})}).catch(e=>console.warn("sw register failed",e)),navigator.serviceWorker.addEventListener("message",e=>{if(e.data&&e.data.type==="update-available"&&!document.getElementById("sw-update")){const t=document.createElement("div");t.id="sw-update",t.style.cssText="position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:2000;padding:8px 14px;border-radius:8px;background:#e87d0d;color:#111;font:600 14px system-ui;cursor:pointer",t.textContent="Je nová verze Blenderu — klepni pro aktualizaci (neuložená práce se ztratí)",t.onclick=()=>navigator.serviceWorker.controller&&navigator.serviceWorker.controller.postMessage({type:"update"}),document.body.appendChild(t)}else e.data&&e.data.type==="updated"&&location.reload()}));const co=document.getElementById("splash"),lo=document.getElementById("splash-shell"),po=document.getElementById("stage-card"),uo=document.querySelector(".stage"),ln=document.getElementById("splash-status"),mo=document.getElementById("progress-phase"),Dt=document.getElementById("progress-percent"),fo=document.getElementById("progress-fill"),jt=document.querySelector(".progress-track"),We=document.getElementById("console-output"),Ve=document.getElementById("start-btn"),Ft=document.getElementById("gpu-warning"),_o=document.getElementById("gpu-warning-text"),Kt=document.getElementById("gpu-ack-row"),dn=document.getElementById("gpu-ack");function Tt(e){lo.dataset.phase=e,po.dataset.phase=e,uo.dataset.phase=e}const St={log:console.log.bind(console),warn:console.warn.bind(console),error:console.error.bind(console)},wo=400,yo=e=>{if(e instanceof Error)return e.stack||e.message;if(typeof e=="string")return e;try{return JSON.stringify(e)}catch{return String(e)}};function Pt(e,t){const n=document.createElement("div");n.className=`console-line ${e}`;const o=document.createElement("span");for(o.className="console-prefix",o.textContent=`[${e}] `,n.append(o,t.map(yo).join(" ")),We.appendChild(n);We.childElementCount>wo;)We.firstElementChild?.remove();We.scrollTop=We.scrollHeight}console.log=(...e)=>{Pt("log",e),St.log(...e)};console.warn=(...e)=>{Pt("warn",e),St.warn(...e)};console.error=(...e)=>{Pt("error",e),St.error(...e)};const j=e=>console.log(e);function Wt(e){const t=["B","KB","MB","GB"];let n=e,o=0;for(;n>=1024&&o<t.length-1;)n/=1024,o++;return`${n>=10||o===0?n.toFixed(0):n.toFixed(1)} ${t[o]}`}function ot(e){const t=e.percent==null?void 0:Math.max(0,Math.min(1,e.percent));if(ln.textContent=e.loaded&&e.total?`${e.message} · ${Wt(e.loaded)} / ${Wt(e.total)}`:e.message,mo.textContent=e.phase[0].toUpperCase()+e.phase.slice(1),t==null){jt.removeAttribute("aria-valuenow"),Dt.textContent="";return}const n=Math.round(t*100);fo.style.width=`${n}%`,jt.setAttribute("aria-valuenow",String(n)),Dt.textContent=`${n}%`}const Gt=e=>{ln.textContent=e},V={assets:{loaded:0,total:0},wasm:{loaded:0,total:0}};function bt(){const e=V.assets.loaded+V.wasm.loaded,t=V.assets.total&&V.wasm.total?V.assets.total+V.wasm.total:void 0;ot({phase:"downloading",loaded:e,total:t,percent:t?e/t:void 0,message:"Downloading Blender"})}const ho="blender-bin-v1",bo=e=>[e.headers.get("etag"),e.headers.get("last-modified"),e.headers.get("content-length")].join("|");async function $t(e){try{const t=new AbortController,n=setTimeout(()=>t.abort(),4e3),o=await fetch(e,{method:"HEAD",cache:"no-store",signal:t.signal});return clearTimeout(n),o.ok?bo(o):null}catch{return null}}async function Ht(e,t){let n=null;try{n=await caches.open(ho)}catch{}if(n)try{const i=await n.match(e);if(i){const c=await $t(e);if(c===null||c===i.headers.get("x-bin-token")){const u=new Uint8Array(await i.arrayBuffer());return V[t].loaded=V[t].total=u.length,bt(),console.log("bin cache hit",e,u.length,c===null?"(server unreachable)":""),u}await n.delete(e)}}catch(i){console.warn("bin cache read failed",e,String(i))}const o=n?await $t(e):null,r=await go(e,t);if(n)try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist().catch(()=>{}),await n.put(e,new Response(r,{headers:{"x-bin-token":o??"","content-length":String(r.length)}}))}catch(i){console.warn("bin cache write failed (quota?)",e,String(i));try{await n.delete(e)}catch{}}return r}async function go(e,t){for(let n=1;;n++)try{return await vo(e,t)}catch(o){if(n>=4)throw o;for(console.warn("fetch retry",n,e,String(o)),V[t].loaded=0,V[t].total=0;document.hidden;)await new Promise(r=>setTimeout(r,500));await new Promise(r=>setTimeout(r,800*n))}}async function vo(e,t){const n=await fetch(e);if(!n.ok||!n.body)throw new Error(`${e}: HTTP ${n.status}`);V[t].total=Number(n.headers.get("Content-Length"))||0;const o=n.body.getReader(),r=[];for(;;){const{done:u,value:b}=await o.read();if(u)break;r.push(b),V[t].loaded+=b.byteLength,bt()}V[t].total||(V[t].total=V[t].loaded),bt();const i=new Uint8Array(V[t].loaded);let c=0;for(const u of r)i.set(u,c),c+=u.length;return i}const it=new Worker(new URL(""+new URL("zstd_worker-BnM-co9b.js",import.meta.url).href,import.meta.url),{type:"module"}),Ye=new Map;let Eo=0;it.onmessage=e=>{const{id:t,out:n,err:o}=e.data,r=Ye.get(t);Ye.delete(t),o?r.rej(new Error(o)):r.res(n)};it.onerror=e=>{for(const t of Ye.values())t.rej(new Error("zstd worker: "+(e.message||"error")));Ye.clear()};const Vt=(e,t)=>new Promise((n,o)=>{const r=++Eo;Ye.set(r,{res:n,rej:o}),it.postMessage({id:r,buf:e.buffer,size:t},[e.buffer])}),gt=await(async()=>{try{const e=await(await fetch("manifest.json")).text(),t=JSON.parse(e);try{localStorage.setItem("manifest.json",e)}catch{}return t}catch(e){const t=localStorage.getItem("manifest.json");if(t)return JSON.parse(t);throw e}})(),vt=()=>{const e=new URLSearchParams(location.search),t=e.get("ipad")==="1"||e.get("ipad")!=="0"&&navigator.maxTouchPoints>1&&/Macintosh|iPad/.test(navigator.userAgent);return(e.get("cycles")??(t?"0":"1"))==="1"&&gt["blender-pc.wasm.zst"]?"blender-pc":"blender"},pn=new TextDecoder;function at(e,t,n){let o=t;const r=t+n;for(;o<r&&e[o]!==0;)o++;return pn.decode(e.subarray(t,o))}function xo(e,t){const n=e[t];if(n&128){let r=n&127;for(let i=t+1;i<t+12;i++)r=r*256+e[i];return r}const o=at(e,t,12).trim();return o?Number.parseInt(o,8):0}function ko(e){const t=pn.decode(e),n={};let o=0;for(;o<t.length;){const r=t.indexOf(" ",o);if(r<0)break;const i=Number.parseInt(t.slice(o,r),10);if(!Number.isFinite(i)||i<=0)break;const c=t.slice(r+1,o+i-1),u=c.indexOf("=");u>=0&&(n[c.slice(0,u)]=c.slice(u+1)),o+=i}return n}function To(e,t){const n=at(e,t,100),o=at(e,t+345,155);return o?`${o}/${n}`:n}function So(e,t){for(let n=t;n<t+512;n++)if(e[n]!==0)return!1;return!0}function rt(e,t,n){let o="";for(let r=0;r<t.length;r++){const i=r===t.length-1;let c=e.get(o);if(c||(c=new Set,e.set(o,c)),c.add(t[r]),i&&!n)break;o=o?`${o}/${t[r]}`:t[r],i&&!e.has(o)&&e.set(o,new Set)}}function Po(e){const t=new Map,n=new Map([["",new Set]]);let o=0,r,i;for(;o+512<=e.length&&!So(e,o);){const c=String.fromCharCode(e[o+156]||0),u=xo(e,o+124),b=o+512,p=b+u;if(p>e.length)throw new Error("asset-fs: truncated tar");const _=e.subarray(b,p),w=(r?.path??i??To(e,o)).replace(/^\.\//,"");r=void 0,i=void 0;const f=w.split("/").filter(Boolean);if(w.startsWith("/")||f.includes(".."))throw new Error(`asset-fs: unsafe path ${w}`);c==="x"?r=ko(_):c==="L"?i=at(_,0,_.length):f.length&&(c==="0"||c==="\0"||c==="")?(t.set(f.join("/"),_),rt(n,f,!1)):f.length&&c==="5"&&rt(n,f,!0),o=b+Math.ceil(u/512)*512}return{files:t,dirs:n}}const Me=e=>e.split("/").filter(Boolean).join("/");function Ro(e){return{stat(t){const n=Me(t),o=e.files.get(n);return o?{size:o.byteLength,isDir:!1}:e.dirs.has(n)?{size:0,isDir:!0}:null},readdir(t){const n=e.dirs.get(Me(t));if(!n)throw new Error(`asset-fs: no such directory ${t}`);return[...n]},readFile(t){const n=e.files.get(Me(t));if(!n)throw new Error(`asset-fs: no such file ${t}`);return n}}}let un=!1,de=null;function ct(){if(de&&de.fatal){Ve.disabled=!0;return}const t=!!(de&&de.software)?dn.checked:!0;Ve.disabled=!un||!t}function Lo(e){de=e,e.ok?(Ft.hidden=!0,Kt.hidden=!0):(Ft.hidden=!1,_o.innerHTML=e.message,Kt.hidden=!e.software),ct()}async function Oo(){if(!navigator.gpu)return{ok:!1,software:!1,fatal:!0,desc:"",message:"This browser has no <b>WebGPU</b> support, so Blender cannot start. Use a recent Chromium-based browser (Chrome/Edge 113+) with hardware acceleration enabled."};try{const e=await navigator.gpu.requestAdapter();if(e&&void 0,e&&(window.__noDualSrc=!e.features.has("dual-source-blending")),!e)return{ok:!1,software:!1,fatal:!0,desc:"",message:"No <b>WebGPU adapter</b> is available, so Blender cannot start. Enable hardware acceleration / GPU access in your browser and reload."};const t=e.info||{},n=[t.vendor,t.architecture,t.device,t.description].filter(Boolean).join(" | "),o=e.isFallbackAdapter||/swiftshader|software|llvmpipe|lavapipe|basic|warp|microsoft basic/i.test(n);return n&&j("WEBGPU_ADAPTER "+n),o?{ok:!1,software:!0,fatal:!1,desc:n,message:"WebGPU is running on a <b>software renderer</b>"+(n?" (<code>"+n+"</code>)":"")+" — Blender will be <b>extremely slow</b>. For real performance, enable hardware GPU acceleration (Chrome: <code>--enable-unsafe-webgpu --enable-features=Vulkan --ignore-gpu-blocklist</code>)."}:{ok:!0,software:!1,fatal:!1,desc:n,message:""}}catch(e){return{ok:!1,software:!1,fatal:!0,desc:"",message:"WebGPU probe failed ("+(e&&e.message||e)+"). Blender cannot start."}}}dn.addEventListener("change",ct);Oo().then(Lo).catch(()=>{});Tt("loading");let[mn,Et]=await Promise.all([Ht("assets.tar.zst","assets").then(e=>(ot({phase:"decompressing",percent:1,message:"Decompressing assets"}),Vt(e,gt["assets.tar.zst"]))),Ht(vt()+".wasm.zst","wasm").then(e=>(ot({phase:"decompressing",percent:1,message:"Decompressing Blender"}),Vt(e,gt[vt()+".wasm.zst"])))]);it.terminate();const Mo=Ro(Po(mn));j(`assets indexed zero-copy: ${mn.length/1048576|0} MB · wasm ${Et.length/1048576|0} MB`);ot({phase:"ready",percent:1,message:"Ready to launch"});Tt("ready");un=!0;ct();const Ao=()=>new Promise((e,t)=>{const n=indexedDB.open("blender-fs",2);n.onupgradeneeded=()=>{const o=n.result;o.objectStoreNames.contains("files")||o.createObjectStore("files",{keyPath:"path"}),o.objectStoreNames.contains("wgsl")||o.createObjectStore("wgsl",{keyPath:"key"})},n.onsuccess=()=>e(n.result),n.onerror=()=>t(n.error)});if(new URLSearchParams(location.search).get("perf")==="1"){const e=document.createElement("div");e.style.cssText="position:fixed;top:4px;right:4px;z-index:99999;background:rgba(0,0,0,.7);color:#9f9;font:12px/1.35 monospace;padding:4px 8px;border-radius:4px;pointer-events:none;white-space:pre",e.textContent="perf: čekám na snímky…",document.body?document.body.appendChild(e):document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(e));let t=0;new BroadcastChannel("blender-perf").onmessage=n=>{const o=n.data;t=performance.now(),window.__PERF__=o,e.textContent=`${(1e3/o.dt_avg_ms).toFixed(0)} FPS  ${o.dt_avg_ms.toFixed(1)} ms (max ${o.dt_max_ms.toFixed(0)})
submits ${o.submits}  passes ${o.passes}  bindgroups ${o.bindgroups}
WebGPU draw/submit ${o.api_ms.toFixed(1)} ms   immediate bufs ${o.imm_bufs} (${o.imm_kb} KB)
textures ${o.tex} / ${o.tex_mb} MB   wasm heap ${o.heap_mb.toFixed(0)} MB`},setInterval(()=>{t&&performance.now()-t>2500?e.style.opacity=".4":e.style.opacity="1"},1e3)}{const e=document.createElement("div");e.style.cssText="position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:99998;background:rgba(20,20,20,.88);color:#fff;font:14px/1.3 system-ui,sans-serif;padding:8px 16px;border-radius:8px;pointer-events:none;display:none",e.textContent="⏳ Kompiluji shadery… (jen poprvé, může to trvat několik sekund)";const t=()=>document.body.appendChild(e);document.body?t():document.addEventListener("DOMContentLoaded",t);let n=0,o=0;new BroadcastChannel("blender-compile").onmessage=()=>{const r=performance.now();n||(n=r),r-n>700&&(e.style.display="block"),clearTimeout(o),o=setTimeout(()=>{e.style.display="none",n=0,window.__COMPILE_SHOWN__=!1},2500),e.style.display==="block"&&(window.__COMPILE_SHOWN__=!0)}}window.__BGUI__={booted:!1,device:!1,window:!1};const Co=(e,t)=>{if(document.getElementById("gpu-lost"))return;window.__GPU_LOST__=e;const n=document.createElement("div");n.id="gpu-lost",n.style.cssText="position:fixed;left:0;right:0;top:0;z-index:99999;padding:14px 18px;background:#b3261e;color:#fff;font:16px system-ui;text-align:center",n.innerHTML="GPU se odpojila ("+e+"). Obnov stránku — rozdělaná práce je v <code>/opfs/home/_autosave.blend</code> (📁). <button style='margin-left:12px;font-size:16px' onclick='location.reload()'>Obnovit</button>",document.body.appendChild(n)},Uo=()=>{if(document.getElementById("blender-quit"))return;window.__BLENDER_QUIT__=!0;const e=document.createElement("div");e.id="blender-quit",e.style.cssText="position:fixed;left:0;right:0;top:0;z-index:99999;padding:14px 18px;background:#444;color:#fff;font:16px system-ui;text-align:center",e.innerHTML="Blender skončil (File ▸ Quit / Ctrl+Q). Uložené soubory v 📁 zůstaly; rozdělaná práce je v <code>/opfs/home/_autosave.blend</code>. <button style='margin-left:12px;font-size:16px' onclick='location.reload()'>Spustit znovu</button>",document.body.appendChild(e)},Yt=+(new URLSearchParams(location.search).get("memwarn")||1500);let qt=0;const Bo=new URLSearchParams(location.search).has("memwarn")||new URLSearchParams(location.search).get("ipad")==="1"||navigator.maxTouchPoints>1&&/Macintosh|iPad|iPhone/.test(navigator.userAgent),Io=e=>{try{if(!Bo){window.__HEAP_MB__=Math.round(e);return}e=Math.round(e),window.__HEAP_MB__=e;const t=e>=Yt+500?2:e>=Yt?1:0;if(t<=qt)return;qt=t;let n=document.getElementById("mem-warn");n||(n=document.createElement("div"),n.id="mem-warn",n.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99996;color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",document.body.appendChild(n)),n.style.background=t===2?"rgba(179,38,30,.95)":"rgba(160,100,0,.95)",n.textContent=(t===2?"⚠️ Paměť "+e+" MB — iPad může tab zabít! ":"Paměť "+e+" MB — blíží se limit iPadu. ")+"Ulož práci (autosave běží) a smaž těžké objekty / sniž Subdivision. ";const o=document.createElement("button");o.textContent="OK",o.style.cssText="margin-left:8px;font-size:15px",o.onclick=()=>{n.style.display="none"},n.append(o),n.style.display="block"}catch{}};new BroadcastChannel("blender-perf").addEventListener("message",e=>{e.data&&e.data.heap_mb&&Io(e.data.heap_mb)});const No=e=>{const t=new Date(Number(e)*1e3),n=t.toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}),o=document.createElement("div");o.id="restored-note",o.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99997;background:rgba(20,50,80,.94);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",o.append("↩️ Obnoveno z "+n+" (rozdělaná práce) ");const r=document.createElement("button");r.textContent="Zahodit",r.style.cssText="margin-left:8px;font-size:15px",r.onclick=()=>{const c=new URL(location.href);c.searchParams.set("restore","no"),location.href=c.toString()};const i=document.createElement("button");i.textContent="OK",i.style.cssText="margin-left:6px;font-size:15px",i.onclick=()=>o.remove(),o.append(r,i),document.body.appendChild(o),window.__RESTORED_AT__=Number(e)},zo=e=>{let t=document.getElementById("saved-note");t||(t=document.createElement("div"),t.id="saved-note",t.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99997;background:rgba(20,60,20,.94);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",document.body.appendChild(t)),t.innerHTML="",t.append("💾 Uloženo: "+e+" ");const n=document.createElement("button");n.textContent="📁 Stáhnout / složka",n.style.cssText="margin-left:8px;font-size:15px",n.onclick=()=>{t.style.display="none",window.__openFileManager&&window.__openFileManager()},t.append(n),t.style.display="block",clearTimeout(t._t),t._t=setTimeout(()=>{t.style.display="none"},9e3)},wt=navigator.maxTouchPoints>1&&/Macintosh|iPad/.test(navigator.userAgent)?"ze zařízení":"z počítače",Do=()=>{let e=document.getElementById("mp-note");e||(e=document.createElement("div"),e.id="mp-note",e.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99997;background:rgba(90,50,10,.95);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",e.textContent="Material Preview je vypnutý (?mp=0) — dostal jsi „MP Lite“ (Solid s texturami, světlem a stíny). Plný MP zapneš odebráním ?mp=0 z adresy.",document.body.appendChild(e)),e.style.display="block",clearTimeout(e._t),e._t=setTimeout(()=>{e.style.display="none"},9e3)},jo=()=>{const e=document.getElementById("import-bar");e&&(e.style.display="none")},Fo=()=>{let e=document.getElementById("import-bar");if(!e){e=document.createElement("div"),e.id="import-bar",e.style.cssText="position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:99997;background:rgba(20,50,90,.95);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw";const t=document.createElement("input");t.type="file",t.multiple=!0,t.id="import-input",t.style.display="none";const n=document.createElement("button");n.id="import-btn",n.textContent="📂 Vybrat soubory "+wt+"…",n.style.cssText="margin-left:8px;font-size:15px",n.onclick=()=>t.click();const o=async(c,u,b)=>{try{const p=window.Module.FS,_=x=>{let B="";for(const v of x.split("/").filter(Boolean)){B+="/"+v;try{p.mkdir(B)}catch{}}};_("/uploads");let w=null;const f=/\.(blend|obj|fbx|glb|gltf|stl|ply|usd[acz]?|abc|dae|svg|x3d|wrl)$/i;for(const x of c){u.textContent="Nahrávám „"+x.name+"“…";const v="/uploads/"+(x.webkitRelativePath||x.name);_(v.slice(0,v.lastIndexOf("/"))),p.writeFile(v,new Uint8Array(await x.arrayBuffer())),(!w||!f.test(w)&&f.test(v))&&(w=v)}if(w){const x=w.lastIndexOf("/");p.writeFile("/tmp/web_pick.txt",new TextEncoder().encode(w.slice(0,x+1)+`
`+w.slice(x+1))),e.style.display="none"}}catch(p){u.textContent="Chyba: "+(p&&p.message||p);return}u.textContent=b};t.onchange=async()=>{await o(t.files,n,"📂 Vybrat soubory "+wt+"…"),t.value=""};const r=document.createElement("input");r.type="file",r.id="import-dir-input",r.style.display="none",r.setAttribute("webkitdirectory","");const i=document.createElement("button");i.id="import-dir-btn",i.textContent="📁 Celá složka (model + textury)…",i.style.cssText="margin-left:8px;font-size:15px",i.onclick=()=>r.click(),r.onchange=async()=>{await o(r.files,i,"📁 Celá složka (model + textury)…"),r.value=""},e.append("Soubor "+wt+": ",n,t,i,r),document.body.appendChild(e)}e.style.display="block"},xt=e=>{so(e);const t=/Writing to (\/\S+)|^Saved "([^"]+)"/.exec(e.trim());t&&zo(t[1]||t[2]),/^Blender quit\b/.test(e.trim())&&Uo();{const n=/^WEB_RESTORED (\d+)/.exec(e.trim());n&&No(n[1])}if(e.includes("WEB_MP_BLOCKED")&&Do(),e.startsWith("WEB_EXPORT /")&&qo(e.slice(11).trim()),e.includes("WEB_FILE_IMPORT_END")?jo():e.includes("WEB_FILE_IMPORT")&&Fo(),e.startsWith("WEB_OPEN_URL ")){const n=e.slice(13).trim();/^https?:\/\//.test(n)&&(window.__LAST_OPEN_URL__=n,window.open(n,"_blank","noopener"))}e.includes("WEBGPU_LOST")&&Co(e.split("WEBGPU_LOST ")[1].split(" ")[0],e.split("WEBGPU_LOST ")[1]),e.includes("WEBGPU_CONTEXT")&&e.includes("real device acquired")&&(window.__BGUI__.device=!0),e.includes("WGPU_FIRST_CONTENT")&&!window.__BGUI__.window&&(window.__BGUI__.window=!0,co.classList.add("done"),G.classList.add("ready"))};window.__scan=xt;const G=document.getElementById("canvas");window.__DPR__=Math.min(3,Math.max(1,parseFloat(new URLSearchParams(location.search).get("dpr"))||1));const fn=()=>{if(G.width!==window.innerWidth||G.height!==window.innerHeight)try{G.width=window.innerWidth,G.height=window.innerHeight}catch{}};fn();window.addEventListener("resize",fn);window.addEventListener("contextmenu",e=>e.preventDefault());Gn(G);const _n=e=>e.preventDefault();G.addEventListener("wheel",_n,{passive:!1});document.addEventListener("wheel",e=>{for(let t=e.target;t&&t!==document.documentElement;t=t.parentElement)if(t.scrollHeight>t.clientHeight+1&&/auto|scroll/.test(getComputedStyle(t).overflowY))return;e.preventDefault()},{passive:!1});let Ge=1,wn=0;for(const e of["touchstart","touchend","touchcancel"])G.addEventListener(e,t=>{wn=t.touches.length},{passive:!0,capture:!0});const Rt=e=>{if(e.preventDefault(),!(wn>0)){if(e.type==="gesturestart"||typeof e.scale!="number"||!(e.scale>0)){Ge=1;return}if(e.type==="gesturechange")for(;e.scale/Ge>1.2||e.scale/Ge<1/1.2;){const t=e.scale>Ge;Ge*=t?1.2:1/1.2,G.dispatchEvent(new WheelEvent("wheel",{deltaY:t?-100:100,clientX:e.clientX,clientY:e.clientY,bubbles:!0,cancelable:!0}))}}};G.addEventListener("gesturestart",Rt);G.addEventListener("gesturechange",Rt);G.addEventListener("gestureend",Rt);G.addEventListener("mousedown",e=>{e.button===1&&e.preventDefault()});G.addEventListener("dragstart",_n);const lt=e=>!!e&&(e.tagName==="INPUT"||e.tagName==="TEXTAREA"||e.tagName==="SELECT"||e.isContentEditable),Ko=new Set(["Tab"," ","Spacebar","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","PageUp","PageDown","Home","End","Backspace","/"]),tt=new Map,yn=e=>e.altKey||!/^Key[A-Z]$/.test(e.code)||!/^[a-zA-Z]$/.test(e.key)?e.code:"Key"+e.key.toUpperCase(),Wo=new Set(["KeyR","KeyT","KeyW","KeyN","KeyQ","KeyL","KeyH","KeyM","Tab"]);let qe=!1;const Xt=(e,t,n,o,r,i)=>window.dispatchEvent(new KeyboardEvent(e,{code:t,key:n,bubbles:!0,cancelable:!0,ctrlKey:!0,shiftKey:o,altKey:r,repeat:!!i})),Go=()=>{qe&&(qe=!1,window.dispatchEvent(new KeyboardEvent("keyup",{code:"ControlLeft",key:"Control",bubbles:!0,cancelable:!0})))};window.addEventListener("keydown",e=>{if(!window.Module||!e.isTrusted||lt(document.activeElement))return;if(e.code==="MetaLeft"||e.code==="MetaRight"){e.stopImmediatePropagation();return}if(!e.metaKey||e.ctrlKey||!e.code||Wo.has(e.code))return;e.stopImmediatePropagation(),e.code!=="KeyV"&&e.preventDefault(),qe||(qe=!0,window.dispatchEvent(new KeyboardEvent("keydown",{code:"ControlLeft",key:"Control",ctrlKey:!0,bubbles:!0,cancelable:!0})));const t=yn(e);Xt("keydown",t,e.key,e.shiftKey,e.altKey,e.repeat),setTimeout(()=>Xt("keyup",t,e.key,e.shiftKey,e.altKey),40)},{capture:!0});window.addEventListener("keyup",e=>{if(e.isTrusted){if(e.code==="MetaLeft"||e.code==="MetaRight"){e.stopImmediatePropagation(),setTimeout(Go,60);return}e.metaKey&&qe&&e.stopImmediatePropagation()}},{capture:!0});window.addEventListener("keydown",e=>{if(!window.Module||!e.isTrusted||lt(document.activeElement))return;const t=yn(e);t!==e.code&&(e.stopImmediatePropagation(),e.preventDefault(),tt.set(e.code,t),window.dispatchEvent(new KeyboardEvent("keydown",{code:t,key:e.key,bubbles:!0,cancelable:!0,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey,metaKey:e.metaKey,repeat:e.repeat})))},{capture:!0});window.addEventListener("keyup",e=>{if(!e.isTrusted||!tt.has(e.code))return;const t=tt.get(e.code);tt.delete(e.code),e.stopImmediatePropagation(),window.dispatchEvent(new KeyboardEvent("keyup",{code:t,key:e.key,bubbles:!0,cancelable:!0,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey,metaKey:e.metaKey}))},{capture:!0});window.addEventListener("keydown",e=>{window.Module&&(lt(document.activeElement)||(e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==="v"||e.key==="V")||(e.ctrlKey||e.metaKey||Ko.has(e.key)||/^F([1-9]|1[0-2])$/.test(e.key)||e.altKey&&/^[a-zA-Z]$/.test(e.key))&&e.preventDefault())},{capture:!0});window.addEventListener("paste",e=>{if(!window.Module||!Module.ccall||lt(document.activeElement))return;const t=e.clipboardData&&e.clipboardData.getData("text/plain");if(typeof t=="string")try{Module.ccall("blender_web_set_clipboard",null,["string"],[t])}catch{}},!0);const Oe=new Map;window.addEventListener("keydown",e=>{e.isTrusted&&Oe.set(e.code,{code:e.code,key:e.key,keyCode:e.keyCode})},!0);window.addEventListener("keyup",e=>{Oe.delete(e.code)},!0);const hn=()=>{for(const e of Oe.values())window.dispatchEvent(new KeyboardEvent("keyup",{code:e.code,key:e.key,keyCode:e.keyCode,bubbles:!0,cancelable:!0}));Oe.size&&j("KEYS_RELEASED_ON_BLUR "+[...Oe.keys()].join(",")),Oe.clear()};window.addEventListener("blur",hn);document.addEventListener("visibilitychange",()=>{document.hidden&&hn()});if(new URLSearchParams(location.search).get("mouserelease")!=="0"){const e=new Set,t={0:1,1:4,2:2,3:8,4:16};let n=0,o=0;const r=(c,u,b)=>{e.delete(c);const p=`H32_RELEASE why=${u} button=${c} target=${b?b.id||b.tagName:"-"}`;console.log(p),b&&(b.id||b.tagName),G.dispatchEvent(new MouseEvent("mouseup",{bubbles:!0,cancelable:!0,view:window,clientX:n,clientY:o,button:c,buttons:0}))},i=c=>{for(const u of[...e])r(u,c)};G.addEventListener("mousedown",c=>{c.isTrusted&&(e.add(c.button),n=c.clientX,o=c.clientY)},!0),window.addEventListener("mouseup",c=>{c.isTrusted&&(n=c.clientX,o=c.clientY,c.target===G?e.delete(c.button):e.has(c.button)&&r(c.button,"offcanvas",c.target))},!0),window.addEventListener("mousemove",c=>{if(c.isTrusted){n=c.clientX,o=c.clientY;for(const u of[...e])c.buttons&t[u]||r(u,"move_nobtn",c.target)}},!0),window.addEventListener("pointercancel",c=>{c.isTrusted&&c.pointerType==="mouse"&&i("pointercancel")},!0),window.addEventListener("blur",()=>i("blur")),document.addEventListener("visibilitychange",()=>{document.hidden&&i("hidden")})}const dt="/mnt",$o=(e,t)=>new Promise((n,o)=>{const r=indexedDB.open("blender-localmount",1);r.onupgradeneeded=()=>{const i=r.result;i.objectStoreNames.contains("handles")||i.createObjectStore("handles",{keyPath:"key"})},r.onsuccess=()=>{const c=r.result.transaction("handles","readwrite");c.objectStore("handles").put({key:e,handle:t}),c.objectStore("handles").put({key:"current",handle:t}),c.oncomplete=()=>n(),c.onerror=()=>o(c.error)},r.onerror=()=>o(r.error)}),Jt=e=>new Promise(t=>{const n=indexedDB.open("blender-localmount",1);n.onupgradeneeded=()=>{const o=n.result;o.objectStoreNames.contains("handles")||o.createObjectStore("handles",{keyPath:"key"})},n.onsuccess=()=>{try{const o=n.result.transaction("handles").objectStore("handles").get(e);o.onsuccess=()=>t(o.result?o.result.handle:null),o.onerror=()=>t(null)}catch{t(null)}},n.onerror=()=>t(null)}),Zt=new BroadcastChannel("localdir-perm");Zt.onmessage=async e=>{const t=e.data;if(!t||t.type!=="request")return;let n=!1;try{const o=await Jt(t.mountPoint)||await Jt("current");if(o&&o.requestPermission){let r=await o.queryPermission({mode:"readwrite"});r!=="granted"&&(r=await o.requestPermission({mode:"readwrite"})),n=r==="granted"}}catch(o){j("localdir readwrite promotion failed: "+(o&&o.message||o))}Zt.postMessage({type:"response",id:t.id,granted:n})};async function Ho(e){const t=[],n=async(o,r)=>{for await(const[i,c]of o.entries()){const u=r?r+"/"+i:i;c.kind==="directory"?(t.push("D	"+u),await n(c,u)):t.push("F	"+u)}};return await n(e,""),t}const Qt=new Set,bn=new Map;let Ae=!1;const gn=(()=>{try{return window.self!==window.top}catch{return!0}})(),vn=!!window.showDirectoryPicker&&!gn&&new URLSearchParams(location.search).get("webkit_sim")!=="1";if(gn){const e=document.createElement("a");e.id="open-new-window",e.href=location.href,e.target="_blank",e.rel="noopener",e.textContent="↗ Otevřít v novém okně",e.style.cssText="position:fixed;right:8px;bottom:8px;z-index:900;padding:6px 10px;border-radius:6px;background:#222c;color:#ddd;font:13px system-ui,sans-serif;text-decoration:none;",document.addEventListener("DOMContentLoaded",()=>document.body.appendChild(e)),document.readyState!=="loading"&&document.body.appendChild(e)}async function En(){const e=await window.showDirectoryPicker({mode:"read"}),t=dt+"/"+e.name;if(!Qt.has(e.name)){await $o(t,e);const n=await Ho(e);bn.set(e.name,n.filter(i=>i.startsWith("F	")&&!i.includes("/")&&/\.blend$/i.test(i)).map(i=>i.slice(2)));const o=window.Module.ccall("wasmfs_mount_localdir","number",["string","string"],[t,n.join(`
`)]);if(o!==0)throw new Error("mount spawn failed ("+o+")");let r=0;for(let i=0;i<300&&r===0;i++)await new Promise(c=>setTimeout(c,50)),r=window.Module.ccall("wasmfs_localdir_mount_status","number",[],[]);if(r!==1)throw new Error("mount did not complete (status "+r+")");Qt.add(e.name),j("mounted "+n.length+" entries at "+t)}return t}function Vo(){return new Promise(e=>{const t=document.createElement("div");t.style.cssText="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font:14px system-ui,sans-serif;color:#ddd;";const n=document.createElement("div");n.id="localdir-dropzone",n.style.cssText="width:440px;max-width:86vw;padding:26px;border-radius:10px;background:#1c1c1c;border:2px dashed #555;text-align:center;transition:border-color .12s,background .12s;",n.innerHTML="<div style='font-size:17px;font-weight:600;margin-bottom:8px'>Open a folder</div><div style='color:#aaa;line-height:1.5'>Your browser doesn't support the folder picker.<br><b>Drag &amp; drop a folder here</b> to open it.<br>(iPad: choose a file instead)</div><button id='dz-files' style='margin-top:14px;padding:12px 22px;border:0;border-radius:8px;background:#e87d0d;color:#111;font:600 16px system-ui;cursor:pointer'>Choose file(s)…</button><input id='dz-input' type='file' multiple style='display:none'><div id='dz-status' style='margin-top:14px;color:#e87d0d;min-height:18px'></div><button id='dz-cancel' style='margin-top:16px;padding:6px 16px;border:0;border-radius:5px;background:#333;color:#ddd;cursor:pointer'>Cancel</button>",t.appendChild(n),document.body.appendChild(t);const o=n.querySelector("#dz-status");let r=!1;const i=p=>{r||(r=!0,t.remove(),e(p))};n.querySelector("#dz-cancel").onclick=()=>i(null);const c=n.querySelector("#dz-input");n.querySelector("#dz-files").onclick=()=>c.click();const u=async p=>{try{const _=window.Module.FS;try{_.mkdir("/uploads")}catch{}for(const f of p)o.textContent="Loading “"+f.name+"”…",_.writeFile("/uploads/"+f.name,new Uint8Array(await f.arrayBuffer()));const w=[...p];w.length===1&&/\.blend$/i.test(w[0].name)?i("file:/uploads/"+w[0].name):w.length&&i("/uploads")}catch(_){o.textContent="Failed: "+(_&&_.message||_)}};c.onchange=()=>u(c.files),t.addEventListener("click",p=>{p.target===t&&i(null)});const b=p=>{n.style.borderColor=p?"#e87d0d":"#555",n.style.background=p?"#242018":"#1c1c1c"};["dragenter","dragover"].forEach(p=>n.addEventListener(p,_=>{_.preventDefault(),_.stopPropagation(),b(!0)})),["dragleave","dragend"].forEach(p=>n.addEventListener(p,_=>{_.preventDefault(),b(!1)})),n.addEventListener("drop",async p=>{p.preventDefault(),p.stopPropagation(),b(!1);const _=p.dataTransfer&&p.dataTransfer.items;let w=null;for(let f=0;_&&f<_.length;f++){const x=_[f].webkitGetAsEntry&&_[f].webkitGetAsEntry();if(x&&x.isDirectory){w=x;break}}if(!w){p.dataTransfer.files.length?u(p.dataTransfer.files):o.textContent="Please drop a folder or a file.";return}try{o.textContent="Reading “"+w.name+"”…";const f=await Yo(w);i(f)}catch(f){o.textContent="Failed: "+(f&&f.message||f)}})})}const en=1;async function Yo(e){const t=dt+"/"+e.name,n=p=>new Promise((_,w)=>{const f=p.createReader(),x=[],B=()=>f.readEntries(v=>{if(!v.length)return _(x);x.push(...v),B()},w);B()}),o=p=>new Promise((_,w)=>p.file(_,w)),r=new Map,i=new Map([["",new Set]]),c=async(p,_)=>{for(const w of await n(p)){const f=_?_+"/"+w.name:w.name,x=f.split("/").filter(Boolean);w.isDirectory?(rt(i,x,!0),await c(w,f)):(r.set(f,w),rt(i,x,!1))}};await c(e,"");const u={async stat(p){const _=Me(p),w=r.get(_);return w?{size:(await o(w)).size,isDir:!1}:i.has(_)?{size:0,isDir:!0}:null},readdir(p){const _=i.get(Me(p));if(!_)throw new Error(`drop-fs: no such directory ${p}`);return[..._]},async readFile(p){const _=r.get(Me(p));if(!_)throw new Error(`drop-fs: no such file ${p}`);const w=await o(_);return new Uint8Array(await w.arrayBuffer())}};Module.geckoProviders=Module.geckoProviders||{},Module.geckoProviders[en]=u;const b=window.Module.ccall("blender_web_mount_provider","number",["number","string"],[en,t]);if(b!==0)throw new Error("provider mount failed ("+b+")");return j("mounted "+r.size+" files at "+t+" (drag-drop, on-demand)"),t}window.__blenderSaveHook=async()=>{if(!Ae&&!(!window.Module||!window.Module.ccall)){Ae=!0;try{const e=await En();e&&window.Module.ccall("blender_web_file_save_at",null,["string"],[e+"/"])}catch(e){e&&e.name==="AbortError"||j("Save folder pick failed: "+(e&&e.message||e))}finally{Ae=!1}}};window.__blenderSaveDownload=e=>{try{const t=window.Module.FS.readFile(e),n=e.split("/").pop()||"untitled.blend",o=new Blob([t],{type:"application/octet-stream"}),r=URL.createObjectURL(o),i=document.createElement("a");i.href=r,i.download=n,document.body.appendChild(i),i.click(),i.remove(),setTimeout(()=>URL.revokeObjectURL(r),15e3);try{window.Module.FS.unlink(e)}catch{}j("downloaded "+n+" ("+t.length+" bytes)")}catch(t){j("save download failed: "+(t&&t.message||t))}};const Ce=new Map,qo=e=>{Ce.set(e,Date.now()),clearTimeout(Ce._t),Ce._t=setTimeout(Jo,800)},Xo=e=>{const t=window.Module.FS.readFile(e),n=document.createElement("a"),o=URL.createObjectURL(new Blob([t],{type:"application/octet-stream"}));n.href=o,n.download=e.split("/").pop()||"export",document.body.appendChild(n),n.click(),n.remove(),setTimeout(()=>URL.revokeObjectURL(o),15e3),j("downloaded "+n.download+" ("+t.length+" bytes)")},Jo=()=>{let e=document.getElementById("export-bar");e||(e=document.createElement("div"),e.id="export-bar",e.style.cssText="position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:99997;background:rgba(20,60,20,.95);color:#fff;font:15px system-ui,sans-serif;padding:8px 14px;border-radius:8px;max-width:92vw",document.body.appendChild(e)),e.innerHTML="";const t=window.Module.FS,n=[...Ce.keys()].filter(r=>{try{return t.stat(r).size>0}catch{return!1}});if(!n.length){e.style.display="none";return}e.append("💾 Export hotový: ");for(const r of n.slice(0,6)){const i=document.createElement("button");i.className="export-dl",i.dataset.path=r,i.textContent="⬇ Stáhnout "+r.split("/").pop(),i.style.cssText="margin:0 4px;font-size:15px",i.onclick=()=>{try{Xo(r)}catch(c){i.textContent="Chyba: "+(c&&c.message||c)}},e.append(i)}n.length>6&&e.append("+"+(n.length-6)+" dalších ");const o=document.createElement("button");o.textContent="✕",o.style.cssText="margin-left:8px;font-size:15px",o.onclick=()=>{Ce.clear(),e.style.display="none"},e.append(o),e.style.display="block",Ce.clear()};function Zo(){return new Promise(e=>{const t=document.createElement("div");t.id="open-chooser",t.style.cssText="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.6);font:14px system-ui,sans-serif;color:#ddd;",t.innerHTML="<div style='width:460px;max-width:88vw;padding:24px;border-radius:10px;background:#1c1c1c;text-align:center'><div style='font-size:17px;font-weight:600;margin-bottom:10px'>Otevřít .blend</div><div style='color:#aaa;line-height:1.5'>Vyber <b>SLOŽKU</b>, ve které je tvůj .blend (Blender pak uvidí celou složku i s texturami).</div><button id='oc-folder' style='margin-top:16px;padding:12px 22px;border:0;border-radius:8px;background:#e87d0d;color:#111;font:600 16px system-ui;cursor:pointer'>Vybrat složku…</button><div style='margin-top:14px;color:#aaa'>nebo</div><button id='oc-file' style='margin-top:10px;padding:10px 20px;border:0;border-radius:8px;background:#333;color:#ddd;font:15px system-ui;cursor:pointer'>Jen jeden soubor…</button><div style='margin-top:6px;color:#888;font-size:12px'>(textury vedle souboru se nenačtou)</div><div><button id='oc-cancel' style='margin-top:16px;padding:6px 16px;border:0;border-radius:5px;background:#2a2a2a;color:#ddd;cursor:pointer'>Zrušit</button></div></div>",document.body.appendChild(t);const n=o=>{t.remove(),e(o)};t.querySelector("#oc-folder").onclick=()=>n("folder"),t.querySelector("#oc-file").onclick=()=>n("file"),t.querySelector("#oc-cancel").onclick=()=>n(null),t.addEventListener("click",o=>{o.target===t&&n(null)})})}function Qo(){return new Promise(e=>{const t=document.createElement("input");t.type="file",t.accept=".blend",t.id="open-single-input",t.style.display="none",document.body.appendChild(t),t.addEventListener("cancel",()=>{t.remove(),e(null)}),t.onchange=async()=>{const n=t.files[0];if(t.remove(),!n)return e(null);const o=window.Module.FS;try{o.mkdir("/uploads")}catch{}o.writeFile("/uploads/"+n.name,new Uint8Array(await n.arrayBuffer())),e("file:/uploads/"+n.name)},t.click()})}function xn(e){const t=window.Module.FS;let n="0";try{n=new TextDecoder().decode(t.readFile("/tmp/dirty.txt"))}catch{}n==="1"&&!window.confirm("Aktuální scéna má neuložené změny. Otevřít soubor a změny zahodit?")||(t.writeFile("/tmp/open_req.txt",e),j("open .blend directly: "+e))}try{history.pushState({blender:1},""),window.addEventListener("popstate",()=>{let e="0";try{e=new TextDecoder().decode(window.Module.FS.readFile("/tmp/dirty.txt"))}catch{}e!=="1"||window.confirm("Odejít z Blenderu? Neuložené změny se ztratí.")?history.back():history.pushState({blender:1},"")})}catch{}const kn=e=>!!e.dataTransfer&&[...e.dataTransfer.types||[]].includes("Files");window.addEventListener("dragover",e=>{kn(e)&&e.preventDefault()});window.addEventListener("drop",async e=>{if(!kn(e))return;e.preventDefault();const t=[...e.dataTransfer.files];if(!t.length||!window.Module||!window.Module.FS)return;const n=window.Module.FS;try{n.mkdir("/uploads")}catch{}for(const o of t)n.writeFile("/uploads/"+o.name,new Uint8Array(await o.arrayBuffer()));j("dropped "+t.map(o=>o.name).join(", ")),t.length===1&&/\.blend$/i.test(t[0].name)?xn("/uploads/"+t[0].name):n.writeFile("/tmp/drop_req.txt",t.map(o=>"/uploads/"+o.name).join(`
`))});window.__blenderFileOpenHook=async()=>{if(!Ae&&!(!window.Module||!window.Module.ccall)){Ae=!0;try{let e=null;if(vn){const t=await Zo();if(t==="folder"){e=await En();const n=bn.get(e.slice(dt.length+1))||[];n.length===1&&(e="file:"+e+"/"+n[0])}else t==="file"&&(e=await Qo())}else e=await Vo();e&&e.startsWith("file:")?xn(e.slice(5)):e&&window.Module.ccall("blender_web_file_open_at",null,["string"],[e+"/"])}catch(e){e&&e.name==="AbortError"||j("File ▸ Open mount failed: "+(e&&e.message||e))}finally{Ae=!1}}};const tn=new URLSearchParams(location.search).get("safe")==="1";function ea(){const e=+(window.__WATCHDOG_MS||45e3);setTimeout(()=>{if(window.__BGUI__.window||document.getElementById("start-hang"))return;const t=document.createElement("div");t.id="start-hang",t.style.cssText="position:fixed;left:0;right:0;top:0;z-index:99999;padding:14px 18px;background:#8a5a00;color:#fff;font:16px system-ui;text-align:center",t.innerHTML=`Start trvá nezvykle dlouho. Po pádu může iPad držet zámek souborů: <b>zavři tento tab úplně</b> (přepínač aplikací) a otevři stránku znovu. <button style='margin-left:12px;font-size:16px' onclick="location.search='?safe=1'">Spustit bez ukládání</button>`,document.body.appendChild(t);const n=setInterval(()=>{window.__BGUI__.window&&(t.remove(),clearInterval(n))},1e3)},e)}async function ta(){if(de&&de.fatal){console.error(de.message.replace(/<[^>]+>/g,""));return}de&&de.software&&console.warn("WebGPU is using a SOFTWARE renderer — Blender will be extremely slow."),Tt("console"),Ve.disabled=!0,Ve.textContent="Starting…",ea();const e=(new URLSearchParams(location.search).get("shadowpool")||"128").replace(/[^0-9]/g,"")||"128",t=(new URLSearchParams(location.search).get("autosave")||"30").replace(/[^0-9]/g,"")||"30",n=(()=>{const m=new URLSearchParams(location.search).get("restore");return m==="no"||m==="ask"||m==="auto"?m:new URLSearchParams(location.search).get("auto")||window.__BARGS?"ask":"auto"})(),o=(new URLSearchParams(location.search).get("undomem")||"300").replace(/[^0-9]/g,"")||"300",r=new URLSearchParams(location.search).get("resetprefs")==="1"?"1":"0",i=(new URLSearchParams(location.search).get("uiscale")||"").replace(/[^0-9.]/g,""),c=new URLSearchParams(location.search),u=c.get("ipad")==="1"||c.get("ipad")!=="0"&&navigator.maxTouchPoints>1&&/Macintosh|iPad/.test(navigator.userAgent),b=u&&c.get("mp")==="0"?"1":"0",p=c.get("mplite")==="1"||u&&c.get("mp")!=="0"?"1":"0",_=(c.get("mppx")||"2").replace(/[^0-9]/g,"")||"2",w=`import bpy
from bpy.app.handlers import persistent
def _cap_pool():
    try:
        for sc in bpy.data.scenes: sc.eevee.shadow_pool_size = '${e}'
    except Exception as e: print('shadowpool', e)
def _cap_pool_opened():
    # iPad: soubor otevřený z disku nese 512 MB shadow pool (+384 MB) → zastropovat jen když je větší než cíl
    try:
        cap = int('${e}')
        for sc in bpy.data.scenes:
            if int(sc.eevee.shadow_pool_size) > cap:
                sc.eevee.shadow_pool_size = '${e}'; print('SHADOWPOOL capped')
    except Exception as e: print('shadowpool', e)
@persistent
def _on_new(*a):
    if not bpy.data.filepath: _cap_pool()
    elif '${b}' == '1' and '${c.get("shadowpool")||""}' == '': _cap_pool_opened()
# Preferences: --factory-startup nečte userpref a na webu není „quit“, který by je uložil → UI scale, navigace,
# klávesové zkratky apod. se po každém načtení stránky ztrácely. Načíst při startu, ukládat při změně.
import os as _os
_UP = bpy.utils.user_resource('CONFIG') + '/userpref.blend'
try:
    if '${r}' == '1' and _os.path.exists(_UP): _os.remove(_UP); print('USERPREF reset')
    if _os.path.exists(_UP): bpy.ops.wm.read_userpref(); print('USERPREF loaded')
except Exception as e: print('USERPREF load ERR', e)
try:
    if '${i}': bpy.context.preferences.view.ui_scale = max(0.5, min(3.0, float('${i}'))); print('UISCALE set ${i}', flush=True)
except Exception as e: print('UISCALE ERR', e)
# Undo paměť: každý undo krok s velkou změnou meshe drží plnou kopii (fuzz: halda 1→3,7 GB za 40 těžkých kroků).
# iPad to nepřežije → výchozí limit ${o} MB (Preferences ▸ System ▸ Undo Memory Limit; ?undomem=0 = bez limitu).
try:
    if float('${o}') > 0 and bpy.context.preferences.edit.undo_memory_limit == 0: bpy.context.preferences.edit.undo_memory_limit = int(float('${o}'))
except Exception as e: print('UNDOMEM ERR', e)
# H7: na iPadu zatím Material Preview/Rendered shazuje GPU → místo toho Solid „MP Lite“ (H22a) + hláška (JS ji zachytí z WEB_MP_BLOCKED).
def _mp_lite_colors(*a):
    # H22g: Workbench kreslí barvu Viewport Display (diffuse_color), ne Base Color z uzlů → u výchozí šedé ji vezmi z Principled BSDF.
    try:
        for m in bpy.data.materials:
            if not m.use_nodes or not m.node_tree or tuple(round(c, 3) for c in m.diffuse_color) != (0.8, 0.8, 0.8, 1.0): continue
            bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if not bsdf: continue
            bc = bsdf.inputs['Base Color']
            if bc.is_linked: continue
            m.diffuse_color = tuple(bc.default_value)
            m.metallic = bsdf.inputs['Metallic'].default_value; m.roughness = bsdf.inputs['Roughness'].default_value
    except Exception as e: print('MPLITE_COLORS ERR', e)
def _mp_guard():
    try:
        for win in bpy.context.window_manager.windows:
            for a in win.screen.areas:
                if a.type == 'VIEW_3D':
                    for sp in a.spaces:
                        if sp.type == 'VIEW_3D' and sp.shading.type in {'MATERIAL', 'RENDERED'}:
                            _mp_lite_colors()
                            sh = sp.shading; sh.type = 'SOLID'
                            # H22a „MP Lite“: Workbench s texturami z materiálů, studiové světlo, bez EEVEE
                            sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_specular_highlight = True
                            sh.show_shadows = True; sh.show_cavity = True; sh.use_dof = False
                            print('WEB_MP_BLOCKED', flush=True)
    except Exception as e: print('MPGUARD ERR', e)
    return 0.5
if '${b}' == '1': bpy.app.timers.register(_mp_guard, first_interval=1.0, persistent=True)
# H24: bl_pkg (Extensions ▸ Install from Disk / Install) spouští blender_ext.py jako podproces → na webu OSError 138
# (emscripten nepodporuje procesy). Nahraď command_output_from_json_0 verzí, která CLI spustí V PROCESU a vrátí stejné zprávy.
def _bl_pkg_inproc(args, use_idle, *, python_args):
    import io, json, contextlib
    import bl_pkg.bl_extension_utils as U
    E = U._web_ext
    buf = io.StringIO(); code = 1
    import shutil
    _o_rename, _o_replace = _os.rename, _os.replace
    def _mv(src, dst, *a, _orig=_o_rename, **k):
        # OPFS (wasmfs) neumí přejmenovat adresář („Resource busy“) → zkopíruj a smaž.
        try: return _orig(src, dst, *a, **k)
        except OSError:
            if _os.path.isdir(src):
                shutil.copytree(src, dst); shutil.rmtree(src)
            else:
                shutil.copy2(src, dst); _os.remove(src)
    _os.rename = _os.replace = _mv
    try:
        with contextlib.redirect_stdout(buf):
            code = E.main([*args, '--output-type=JSON_0'])
    except SystemExit as e: code = e.code
    except BaseException as e:
        buf.write(json.dumps(['ERROR', 'blender_ext in-process: ' + repr(e)]) + chr(0))
    finally:
        _os.rename, _os.replace = _o_rename, _o_replace
    msgs = []
    for part in buf.getvalue().split(chr(0)):
        if part.strip():
            j = json.loads(part); msgs.append((j[0], j[1]))
    print('BL_PKG inproc', args[0] if args else '', 'exit', code, 'msgs', len(msgs), flush=True)
    for m in msgs: print('BL_PKG msg', str(m)[:130], flush=True)
    yield msgs
def _patch_bl_pkg():
    try:
        import importlib.util, sys as _sys
        import bl_pkg.bl_extension_utils as U
        if getattr(U, '_web_ext', None) is not None: return None
        path = _os.path.join(U.BASE_DIR, 'cli', 'blender_ext.py')
        spec = importlib.util.spec_from_file_location('blender_ext_inproc', path)
        mod = importlib.util.module_from_spec(spec); _sys.modules['blender_ext_inproc'] = mod; spec.loader.exec_module(mod)
        U._web_ext = mod; U.command_output_from_json_0 = _bl_pkg_inproc
        print('BL_PKG patched (in-process blender_ext)', flush=True)
        return None
    except ImportError: return 2.0
    except Exception as e:
        print('BL_PKG patch ERR', e, flush=True); return None
bpy.app.timers.register(_patch_bl_pkg, first_interval=1.0, persistent=True)
# H19: import operátory (File ▸ Import, Image ▸ Open, Append…) otevřou vnitřní file browser, který vidí jen wasm FS.
# Pokud takový browser vznikne, řekni stránce (WEB_FILE_IMPORT → tlačítko „Vybrat soubory z počítače“); stránka nahraje
# soubory do /uploads a zapíše /tmp/web_pick.txt (adresář + jména) → tady je nastavíme do file browseru.
_imp = {'seen': set()}
def _is_import_op(idn):
    # H23: SpaceFileBrowser.active_operator.bl_idname je ve tvaru 'IMAGE_OT_open' (ne 'image.open') → normalizuj.
    idn = idn.lower().replace('_ot_', '.')
    # H24: Preferences ▸ Add-ons/Extensions ▸ Install from Disk (extensions.package_install_files, preferences.addon_install,
    # theme/studiolight/app_template_install) je taky čtecí file browser → stejná lišta „Vybrat soubory z počítače“.
    # H42 (Lukáš 9.11.): seznam povolených operátorů pořád něco vynechal (Add ▸ Image ▸ Reference, ikonka složky u cesty
    # v poli = buttons.file_browse, sequencer strip_add, node.add_file…). Obráceně: KAŽDÝ souborový prohlížeč je "čtecí"
    # (ukáže lištu „Vybrat soubory ze zařízení“), KROMĚ těch, co ukládají. Zbytečná lišta nevadí, chybějící zablokuje uživatele.
    # H42a (17. 11., h42_win.sh): wm.recover_auto_save ČTE soubor (název obsahuje 'save'), sound.mixdown ZAPISUJE zvuk.
    if 'recover' in idn: return True
    if any(w in idn for w in ('export', 'save', 'render.', 'bake', 'write', 'screenshot', 'directory_browse', 'mixdown')):
        return False
    return True
def _import_assist():
    try:
        cur = set()
        pick = None
        if _os.path.exists('/tmp/web_pick.txt'):
            pick = open('/tmp/web_pick.txt').read().split('\\n'); _os.remove('/tmp/web_pick.txt')
        for win in bpy.context.window_manager.windows:
            for a in win.screen.areas:
                if a.type != 'FILE_BROWSER': continue
                for sp in a.spaces:
                    if sp.type != 'FILE_BROWSER' or sp.active_operator is None or not _is_import_op(sp.active_operator.bl_idname): continue
                    key = sp.as_pointer(); cur.add(key)
                    if key not in _imp['seen']:
                        _imp['seen'].add(key); print('WEB_FILE_IMPORT ' + sp.active_operator.bl_idname.lower().replace('_ot_', '.'), flush=True)
                    if pick and len(pick) > 1:
                        sp.params.directory = pick[0].encode(); sp.params.filename = pick[1]
                        print('WEB_FILE_IMPORT_PICKED ' + pick[0] + ' ' + str(len(pick) - 1), flush=True)
        if _imp['seen'] - cur:
            _imp['seen'] &= cur
            if not cur: print('WEB_FILE_IMPORT_END', flush=True)
    except Exception as e: print('IMPORT_ASSIST ERR', e)
    return 0.4
bpy.app.timers.register(_import_assist, first_interval=2.0, persistent=True)
# H20: export watcher — WASMFS obchází JS FS, proto Python hlídá adresáře a hlásí nové/změněné soubory (WEB_EXPORT <cesta>).
_ew = {'snap': None, 'pend': {}}
_EW_EXT = ('.obj', '.mtl', '.fbx', '.glb', '.gltf', '.bin', '.stl', '.ply', '.usd', '.usda', '.usdc', '.usdz', '.abc', '.dae', '.svg', '.x3d', '.wrl', '.png', '.jpg', '.jpeg', '.exr', '.tif', '.tiff', '.bmp', '.tga', '.hdr', '.webp', '.dds', '.mp4', '.avi', '.mkv', '.mov', '.wav', '.mp3', '.flac', '.ogg', '.pdf', '.json', '.csv', '.zip', '.vdb', '.bvh', '.blend')
def _ew_scan():
    out = {}
    for root, depth in (('/uploads', 3), ('/tmp', 1), ('/opfs/home', 2), ('/home', 2), (_os.getcwd(), 1)):
        stack = [(root, 0)]
        while stack:
            d, k = stack.pop()
            try: it = list(_os.scandir(d))
            except Exception: continue
            for e in it:
                try:
                    if e.is_dir(follow_symlinks=False):
                        if k + 1 < depth and e.name not in ('.config', '__pycache__', '.cache'): stack.append((e.path, k + 1))
                    elif e.name.lower().endswith(_EW_EXT) and 'autosave' not in e.name and not e.name.endswith(('.blend1', '.blend@')) and e.name != 'quit.blend' and not e.name.startswith('copybuffer'):
                        st = e.stat(); out[e.path] = (st.st_mtime_ns, st.st_size)
                except Exception: pass
    return out
def _export_watch():
    try:
        cur = _ew_scan()
        if _ew['snap'] is None: _ew['snap'] = cur; return 0.5
        for p, v in cur.items():
            if _ew['snap'].get(p) == v: continue
            if _ew['pend'].get(p) == v:
                _ew['snap'][p] = v; del _ew['pend'][p]
                if v[1] > 0: print('WEB_EXPORT ' + p, flush=True)
            else: _ew['pend'][p] = v
        for p in list(_ew['snap']):
            if p not in cur: del _ew['snap'][p]
    except Exception as e: print('EXPORT_WATCH ERR', e)
    return 0.5
bpy.app.timers.register(_export_watch, first_interval=3.0, persistent=True)
def _save_prefs():
    try:
        if bpy.context.preferences.is_dirty: bpy.ops.wm.save_userpref(); print('USERPREF saved')
    except Exception as e: print('USERPREF save ERR', e)
    return 5.0
bpy.app.timers.register(_save_prefs, first_interval=10.0, persistent=True)
# Help ▸ Manual, odkazy v dialozích: webbrowser.open() na webu nic nedělá → pošli URL stránce (main.js scan → window.open).
import webbrowser as _wb, sys as _sys
class _WebBrowser(_wb.BaseBrowser):
    def open(self, url, new=0, autoraise=True):
        print('WEB_OPEN_URL ' + url); _sys.stdout.flush(); return True
_wb.register('blender-web', None, _WebBrowser('blender-web'), preferred=True)
_cap_pool()
bpy.app.handlers.load_post.append(_on_new)
# B3k: lite platí i po File ▸ New / otevření souboru (persistent). Původní hodnoty si pamatuje a do .blend je při ukládání
# vrátí (save_pre), po uložení zase lite (save_post), takže soubor z iPadu má na PC svoje stíny / vzorky.
_ml_orig = {}
def _ml_items(sc):
    return ((sc.render, 'render', 'preview_pixel_size', '${_}'), (sc.eevee, 'eevee', 'taa_samples', 1), (sc.eevee, 'eevee', 'use_shadows', False),
            (sc.eevee, 'eevee', 'use_raytracing', False), (sc.eevee, 'eevee', 'use_volumetric_shadows', False), (sc.eevee, 'eevee', 'use_gtao', False))
def _mp_lite_eevee(*a):
    if '${p}' != '1': return
    ok = []
    for sc in bpy.data.scenes:
        for obj, grp, name, val in _ml_items(sc):
            try:
                if hasattr(obj, name):
                    k = (sc.name, grp, name)
                    if k not in _ml_orig: _ml_orig[k] = getattr(obj, name)
                    setattr(obj, name, val); ok.append(name)
            except Exception as e: print('MPLITE_EEVEE', name, e)
    print('MPLITE_EEVEE applied ' + ','.join(sorted(set(ok))), flush=True)
def _ml_load(*a):
    _ml_orig.clear(); _mp_lite_eevee()
def _ml_save_pre(*a):
    for sc in bpy.data.scenes:
        for obj, grp, name, val in _ml_items(sc):
            k = (sc.name, grp, name)
            try:
                if k in _ml_orig and getattr(obj, name) == val: setattr(obj, name, _ml_orig[k])
            except Exception as e: print('MPLITE_EEVEE save', name, e)
_mp_lite_eevee()
if '${p}' == '1':
    bpy.app.handlers.load_post.append(bpy.app.handlers.persistent(_ml_load))
    bpy.app.handlers.save_pre.append(bpy.app.handlers.persistent(_ml_save_pre))
    bpy.app.handlers.save_post.append(bpy.app.handlers.persistent(_mp_lite_eevee))
# Autosave: Blenderův vlastní autosave timer na webu nezapíše nic (ověřeno 3 min, 1 min interval) a /tmp je v paměti.
# iPad Safari zabíjí tab na pozadí → vlastní kopie do /opfs/home/_autosave.blend (viditelná v 📁), jen když je scéna změněná.
import os, time
_AS = '/opfs/home/_autosave.blend'
_AS_EVERY = float('${t}')
_as = {'wait': _AS_EVERY}
try:
    if os.path.exists(_AS): os.replace(_AS, '/opfs/home/_autosave_prev.blend'); print('AUTOSAVE previous session kept as /opfs/home/_autosave_prev.blend')
except Exception as e: print('AUTOSAVE rotate ERR', e)
_PREV = '/opfs/home/_autosave_prev.blend'
_RESTORE = '${n}'
_offer = {'tries': 0}
def _offer_restore():
    # Po pádu/zavření tabu nabídnout poslední autosave (popup v Blenderu, funguje i prstem).
    _offer['tries'] += 1
    try:
        wm = bpy.context.window_manager
        if not wm.windows:
            return 2.0 if _offer['tries'] < 30 else None
        if bpy.data.filepath or not os.path.exists(_PREV) or os.path.getsize(_PREV) < 1000: return None
        if _RESTORE == 'no': return None
        if _RESTORE == 'auto':
            mt = int(os.path.getmtime(_PREV)); print('RESTORE_AUTO', os.path.getsize(_PREV), flush=True)
            bpy.ops.wm.open_mainfile(filepath=_PREV)
            print('WEB_RESTORED', mt, flush=True); return None
        def _draw(self, ctx):
            op = self.layout.operator('wm.open_mainfile', text='Obnovit poslední práci', icon='FILE_REFRESH')
            op.filepath = _PREV
            self.layout.label(text='Soubor: _autosave_prev.blend (též v 📁)')
        print('RESTORE_OFFER', os.path.getsize(_PREV), flush=True)
        wm.popup_menu(_draw, title='Našel jsem rozdělanou práci', icon='INFO')
    except Exception as e: print('RESTORE_OFFER ERR', e)
    return None
def _file_menu_restore(self, ctx):
    if os.path.exists(_PREV) and os.path.getsize(_PREV) > 1000:
        self.layout.separator()
        self.layout.operator('wm.open_mainfile', text='Obnovit poslední práci (autosave)', icon='FILE_REFRESH').filepath = _PREV
try: bpy.types.TOPBAR_MT_file.append(_file_menu_restore)
except Exception as e: print('RESTORE menu ERR', e)
bpy.app.timers.register(_offer_restore, first_interval=5.0, persistent=True)
def _autosave():
    try:
        if bpy.data.is_dirty and bpy.context.window_manager.windows:
            t = time.time()
            bpy.ops.wm.save_as_mainfile(filepath=_AS, copy=True, compress=True)
            dt = time.time() - t
            _as['wait'] = max(_AS_EVERY, dt * 20); _as['last'] = time.time()
            print('AUTOSAVE', os.path.getsize(_AS), round(dt, 2))
    except Exception as e: print('AUTOSAVE ERR', e)
    return _as['wait']
bpy.app.timers.register(_autosave, first_interval=_AS_EVERY, persistent=True)
# B3-POJISTKA: iPad padá typicky 0,2–2 s po přepnutí na Material Preview / jiný workspace (tvorba shaderů). msgbus zavolá
# uložení hned po přepnutí, ještě před vykreslením, takže se neztratí práce od posledního 30s autosave.
_as['last'] = 0.0
def _autosave_now(reason):
    try:
        if bpy.data.is_dirty and time.time() - _as['last'] > 3.0:
            t = time.time()
            bpy.ops.wm.save_as_mainfile(filepath=_AS, copy=True, compress=True)
            _as['last'] = time.time()
            print('AUTOSAVE', reason, os.path.getsize(_AS), round(_as['last'] - t, 2), flush=True)
    except Exception as e: print('AUTOSAVE ERR', reason, e)
_as_owner = object()
def _as_subscribe(*_):
    bpy.msgbus.clear_by_owner(_as_owner)
    bpy.msgbus.subscribe_rna(key=(bpy.types.View3DShading, 'type'), owner=_as_owner, args=('shading',), notify=_autosave_now)
    bpy.msgbus.subscribe_rna(key=(bpy.types.Window, 'workspace'), owner=_as_owner, args=('workspace',), notify=_autosave_now)
_as_subscribe()
bpy.app.handlers.load_post.append(bpy.app.handlers.persistent(_as_subscribe))`,f=navigator.maxTouchPoints>1&&/Macintosh|iPad/.test(navigator.userAgent),x=c.get("webkit_sim")==="1"||/AppleWebKit/.test(navigator.userAgent)&&!/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(navigator.userAgent),B=parseInt(c.get("pool")||(f?"8":"32"),10)||32,v=`import bpy, os
_dirty = [None]
try:
    # C1: uložené uživatelské nastavení z doby před Cycles nemá add-on zapnutý
    if bpy.app.build_options.cycles and 'cycles' not in bpy.context.preferences.addons:
        import addon_utils; addon_utils.enable('cycles', default_set=True)
except Exception: pass
def _drop_one(fp):
    # H38: soubor přetažený na plátno (main.js): import jako FileHandlery desktopu, obrázky načíst
    ext = os.path.splitext(fp)[1].lower()
    imp = {'.obj': 'wm.obj_import', '.stl': 'wm.stl_import', '.ply': 'wm.ply_import', '.fbx': 'import_scene.fbx',
           '.glb': 'import_scene.gltf', '.gltf': 'import_scene.gltf', '.usd': 'wm.usd_import', '.usda': 'wm.usd_import',
           '.usdc': 'wm.usd_import', '.usdz': 'wm.usd_import', '.abc': 'wm.alembic_import', '.svg': 'import_curve.svg', '.bvh': 'import_anim.bvh'}
    try:
        if ext in imp:
            mod, op = imp[ext].split('.'); r = getattr(getattr(bpy.ops, mod), op)(filepath=fp)
        elif ext in ('.png', '.jpg', '.jpeg', '.exr', '.hdr', '.tif', '.tiff', '.bmp', '.tga', '.webp'):
            r = bpy.data.images.load(fp, check_existing=True).name
        else:
            r = 'jen nahráno do /uploads'
        print('DROP_REQ', fp, r)
    except Exception as e: print('DROP_REQ failed', fp, e)
def _open_tick():
    try:
        d = '1' if bpy.data.is_dirty else '0'
        if d != _dirty[0]:
            _dirty[0] = d
            with open('/tmp/dirty.txt', 'w') as f: f.write(d)
        p = '/tmp/open_req.txt'
        if os.path.exists(p):
            with open(p) as f: fp = f.read().strip()
            os.remove(p)
            print('OPEN_REQ', fp)
            bpy.ops.wm.open_mainfile(filepath=fp)
        p = '/tmp/drop_req.txt'
        if os.path.exists(p):
            with open(p) as f: fps = [x for x in f.read().split('\\n') if x]
            os.remove(p)
            for fp in fps: _drop_one(fp)
    except Exception as e: print('OPEN_REQ failed', e)
    return 0.3
bpy.app.timers.register(_open_tick, first_interval=1.0, persistent=True)`,U=`import bpy
_WEB_LINKS = (
    ("About Blender Web (unofficial)", "https://github.com/GGlukyy/blender-wasm#readme"),
    ("GitHub: GGlukyy/blender-wasm", "https://github.com/GGlukyy/blender-wasm"),
    ("itch.io: ggluki", "https://ggluki.itch.io/blender-web-unofficial-test"),
    ("Source code (GPL): GGlukyy/blender", "https://github.com/GGlukyy/blender"),
    ("Based on HeyPuter/blender-wasm", "https://github.com/heyputer/blender-wasm"),
)
def _web_status(self, context):
    self.layout.operator("wm.url_open", text="Unofficial web port · GGluki", emboss=False).url = _WEB_LINKS[1][1]
def _web_help(self, context):
    self.layout.separator()
    for t, u in _WEB_LINKS:
        self.layout.operator("wm.url_open", text=t, icon='URL').url = u
bpy.types.STATUSBAR_HT_header.append(_web_status)
bpy.types.TOPBAR_MT_help.append(_web_help)`,A=Mn(c);window.Module={poolSize:B,arguments:["--factory-startup","--python-expr",w,"--python-expr",v,"--python-expr",U,...no(),...Nn(A),...window.__BARGS||[]],canvas:G,print:m=>{j(m),xt(m)},printErr:m=>{j("[err] "+m),xt(m)},instantiateWasm:(m,h)=>(WebAssembly.instantiate(Et,m).then(O=>{Et=null,h(O.instance,O.module)}),{}),preRun:[function(){try{if(tn||(ENV.BLENDER_WEB_OPFS="1"),ENV.HOME=tn?"/tmp":"/opfs/home",ENV.BLENDER_SYSTEM_RESOURCES="/assets/5.3",ENV.BLENDER_SYSTEM_PYTHON="/assets",ENV.PYTHONHOME="/assets",ENV.WGSL_SEED_URL=new URL("wgsl-cache.json",location.href).href,window.__CAPENV)for(const m in window.__CAPENV)ENV[m]=window.__CAPENV[m];ENV.WGPU_PERF="1";{const m=new URLSearchParams(location.search);m.get("bgpurge")==="0"&&(ENV.WGPU_BG_PURGE="0");const h=m.get("bp");(h==="1"||h!=="0"&&(m.get("ipad")==="1"||f))&&(ENV.WGPU_BP="1")}ENV.WGPU_BP,new URLSearchParams(location.search).get("perf")==="1"&&new URLSearchParams(location.search).get("reglog")==="1"&&(ENV.WGPU_REGIONLOG="1"),new URLSearchParams(location.search).get("passlog")==="1"&&(ENV.WGPU_PASSLOG="1"),new URLSearchParams(location.search).get("nocompute")==="1"&&(ENV.WGPU_NO_COMPUTE="1");{const m=new URLSearchParams(location.search).get("nodualsrc");(m==="1"||m!=="0"&&(f||x||window.__noDualSrc))&&(ENV.WGPU_NO_DUALSRC="1")}console.log("WEB_FLAGS "+JSON.stringify({nodualsrc:ENV.WGPU_NO_DUALSRC||"0",mp_lite:p,pool:B,bp:ENV.WGPU_BP||"0",webkit:x,ipad_ua:f})),new URLSearchParams(location.search).get("compilelog")==="1"&&(ENV.WGPU_LOG_COMPILE="1"),new URLSearchParams(location.search).get("drawlog")==="1"&&(ENV.WGPU_LOG_DRAWS="1"),new URLSearchParams(location.search).get("iconprev")==="1"&&(ENV.BLENDER_WEB_ICON_PREVIEWS="1");{const m=new URLSearchParams(location.search).get("env");if(m)for(const h of m.split(",")){const[O,P]=h.split("=");/^[A-Z0-9_]+$/.test(O)&&(ENV[O]=P??"1")}}}catch(m){j("preRun ENV: "+m)}Module.geckoProviders={0:Mo},ENV.BLENDER_WEB_ASSET_PROVIDER="1",addRunDependency("wgsl-cache"),(async()=>{const m=await Ao(),h=await new Promise((d,H)=>{const K=m.transaction("wgsl").objectStore("wgsl").getAll();K.onsuccess=()=>d(K.result),K.onerror=()=>H(K.error)});let O=[];try{const d=await fetch("wgsl-cache.json");d.ok&&(O=await d.json())}catch{}const P=d=>{if(typeof d!="string")return d;const H=/^override\s+(\w+)\s*:\s*\w+\s*=\s*([^;]+);[ \t]*\n?/gm;let K=d,k,pe=[];for(;(k=H.exec(d))!==null;){const ue=d.slice(d.lastIndexOf(`
`,k.index-1)+1,k.index),ye=d.slice(0,Math.max(k.index-1,0)).split(`
`).pop();/@id\(\d+\)/.test(ue)||/^\s*@id\(\d+\)\s*$/.test(ye)||pe.push([k[0],k[1],k[2].trim()])}for(const[ue,ye,me]of pe)K=K.replace(ue,""),K=K.replace(new RegExp("(?<![\\w.])"+ye+"(?!\\w)","g"),"("+me+")");return K},Y=new URLSearchParams(location.search).has("noovfix"),q=d=>Y?d:P(d);globalThis.__WGSL_CACHE__=new Map([...O.map(([d,H])=>[d,q(H)]),...h.map(d=>[d.key,q(d.wgsl)])]),globalThis.__WGSL_CACHE_PUT__=(d,H)=>{try{m.transaction("wgsl","readwrite").objectStore("wgsl").put({key:d,wgsl:H})}catch{}}})().catch(m=>j("wgsl cache: "+m)).finally(()=>removeRunDependency("wgsl-cache"))}],onRuntimeInitialized:()=>{ro(),zn(A,G,j),window.__rtInit=!0;try{window.Module.FS.mkdir(dt)}catch{}try{window.Module.ccall("blender_web_set_has_fsaccess",null,["number"],[vn?1:0])}catch(m){j("set_has_fsaccess: "+m)}},onAbort:m=>{let h="";try{h=String(new Error().stack).slice(0,1500)}catch{}const O=String(m),P=O.indexOf(" @@STACK@@ ");O.slice(0,P<0?200:Math.min(P,200)),P<0||O.slice(P+11,P+4011),j("ABORT: "+m),Gt("Failed to start: "+m)}};const z=(m,h,O)=>{if(document.getElementById("oom-overlay"))return;const P=document.createElement("div");if(P.id="oom-overlay",P.style.cssText="position:fixed;inset:0;z-index:99999;background:#b00020;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;font:600 28px/1.4 -apple-system,sans-serif",P.innerHTML="<div style='font-size:64px'>⚠️</div><div>"+m+"</div><div style='font-weight:400;font-size:22px;margin-top:16px;max-width:640px'>"+h+"</div>",O){const Y=document.createElement("button");Y.textContent=O.label,Y.style.cssText="margin-top:24px;font-size:22px;padding:10px 22px",Y.onclick=O.onclick,P.appendChild(Y)}document.body.appendChild(P)},ne=/out of memory|Cannot allocate Wasm memory/i,Q=()=>{Gt("Out of memory — close this tab completely and reopen the page. / Nedostatek paměti — zavři tento tab a otevři stránku znovu."),z("Safari didn't give Blender memory / Safari nedalo Blenderu paměť","<b>Close this tab completely</b> (swipe it away in the tab overview) and open the page again — Safari frees the memory of a crashed tab late. Close other heavy tabs too. Private tabs have a lower limit.<br><br><b>Zavři tuhle záložku úplně</b> (v přehledu záložek ji odsuň pryč) a otevři stránku znovu — Safari uvolňuje paměť spadlé záložky se zpožděním. Zavři i ostatní těžké záložky. V soukromém tabu je limit nižší.",{label:"Try with less memory / Zkusit s menší pamětí",onclick:()=>{const m=new URL(location.href);m.searchParams.set("pool","4"),location.href=m.toString()}})};addEventListener("unhandledrejection",m=>{ne.test(String(m.reason&&(m.reason.message||m.reason)))&&Q()}),addEventListener("error",m=>{ne.test(String(m.message||m.error&&m.error.message||""))&&Q()});try{const m=indexedDB.open("blender-probe");m.onerror=()=>z("Soukromý tab není podporován","Otevři Blender v normálním tabu Safari (ne v soukromém)."),m.onsuccess=()=>{try{m.result.close()}catch{}}}catch{z("Soukromý tab není podporován","Otevři Blender v normálním tabu Safari (ne v soukromém).")}const xe=function(){const m=globalThis.__PT_SEARCH||location.search,h=/[?&]webkit_sim=1/.test(m),O=h&&/[?&]sim_nos1=1/.test(m);if(h&&globalThis.GPUAdapter&&!GPUAdapter.prototype.__sim){const y=GPUAdapter.prototype;y.__sim=!0;const g=new Set(["atomic-vec2u-min-max","clip-distances","dual-source-blending","primitive-index","subgroup-size-control","subgroups","texture-component-swizzle","texture-compression-unaligned","texture-formats-tier2"]),T={maxBufferSize:1073741824,maxStorageBufferBindingSize:1073741824,maxColorAttachmentBytesPerSample:64,maxSampledTexturesPerShaderStage:44};O&&(T.maxStorageBuffersPerShaderStage=8);const F=(/[?&]sim_keep=([^&]*)/.exec(m)||[])[1],C=(/[?&]sim_nocap=([^&]*)/.exec(m)||[])[1];if(F)for(const X of F.split(","))g.delete(X);if(C)for(const X of C.split(","))delete T[X];const $=Object.getOwnPropertyDescriptor(y,"features"),oe=Object.getOwnPropertyDescriptor(y,"limits");Object.defineProperty(y,"features",{get(){return new Set([...$.get.call(this)].filter(X=>!g.has(X)&&!X.startsWith("chromium-")))}}),Object.defineProperty(y,"limits",{get(){const X=oe.get.call(this),ee={};for(const W in X)ee[W]=W in T?Math.min(X[W],T[W]):X[W];return ee}}),console.log("WEBKIT_SIM on")}if(globalThis.GPUAdapter&&!GPUAdapter.prototype.__s1){const y=GPUAdapter.prototype,g=y.requestDevice;y.__s1=!0,y.requestDevice=function(T){T=Object.assign({},T||{});const F=Object.assign({},T.requiredLimits||{});for(const C of["maxStorageBuffersInFragmentStage","maxStorageBuffersInVertexStage","maxStorageTexturesInFragmentStage","maxStorageTexturesInVertexStage"])C in this.limits&&!(C in F)&&(F[C]=O?8:this.limits[C]);return T.requiredLimits=F,g.call(this,T)}}if(!globalThis.GPUDevice)return;const P=GPUDevice.prototype,Y=new WeakMap,q=new Map,d=globalThis.__OVR_STATS={specialized:0,leftover:0,modules:0,ovModules:0,pipes:0},H=()=>{(d.specialized<=3||d.specialized%100===0)&&console.log("OVR_SPEC "+JSON.stringify(d))},K=P.createShaderModule;P.createShaderModule=function(y){const g=K.call(this,y);if(d.modules++,y&&typeof y.code=="string"&&/\boverride\b/.test(y.code)&&(Y.set(g,y),d.ovModules++),y&&typeof y.code=="string")for(const T of y.code.matchAll(/(\w+)\s*:\s*texture_storage_\w+<(\w+),\s*read_write>/g))/^r32(float|uint|sint)$/.test(T[2])||console.log("WGPU_RW_STORAGE_BAD '"+(y.label||"?")+"' var="+T[1]+" fmt="+T[2]);return g};const k=(y,g)=>y==="bool"?g?"true":"false":y==="u32"?String(g>>>0):y==="i32"?String(g|0):Number.isInteger(g)?g.toFixed(1):String(g),pe=(y,g)=>{if(!g)return;const T=Y.get(g.module);if(!T)return;const F=g.constants||{},C=T.code+"\0"+JSON.stringify(F);let $=q.get(C);if(!$){const oe=T.code.replace(/(?:@id\((\d+)\)\s*)?override\s+(\w+)\s*:\s*(\w+)\s*(?:=\s*([^;]+))?;/g,(X,ee,W,J,Xe)=>{let ve=F[W];return ve===void 0&&ee!==void 0&&(ve=F[ee]),ve!==void 0?`const ${W} : ${J} = ${k(J,ve)};`:Xe!==void 0?`const ${W} : ${J} = ${Xe.trim()};`:X});/\boverride\b/.test(oe)&&(d.leftover++,h&&console.log("WEBKIT_SIM_BAD override zůstal: '"+(T.label||"?")+"'")),d.specialized++,$=K.call(y,{...T,code:oe}),q.set(C,$),H()}g.module=$,delete g.constants},ue=P.createRenderPipeline,ye=P.createComputePipeline,me=/[?&]pipethrow=(\w+)/.exec(globalThis.__PT_SEARCH||location.search);let Ue=null,Be=null;const ke=y=>{try{(Be||(Be=new BroadcastChannel("blender-gpuerr"))).postMessage(y)}catch{}},Ie=/[?&]tel=1/.test(globalThis.__PT_SEARCH||location.search);let Ne=null;const Te=y=>{try{const g=(y.vertex&&y.vertex.buffers||[]).map(T=>T?T.arrayStride+":"+[...T.attributes].map(F=>F.shaderLocation+"="+F.format).join(","):"-").join("|");(Ne||(Ne=new BroadcastChannel("blender-pipe"))).postMessage({label:y.label,vb:g,n:d.pipes})}catch{}};if(Ie){const y={rgba32float:16,rg32float:8,rgba16float:8,"depth32float-stencil8":8,r8unorm:1,r8uint:1,r8snorm:1,rg8unorm:2,r16float:2,r16uint:2,rg16float:4},g=new WeakMap,T={alloc:0,freed:0};let F=null;const C=()=>{try{(F||(F=new BroadcastChannel("blender-churn"))).postMessage(T)}catch{}},$=P.createTexture,oe=globalThis.GPUTexture&&GPUTexture.prototype,X=oe&&oe.destroy;oe&&(P.createTexture=function(ee){const W=$.call(this,ee),J=W.width*W.height*W.depthOrArrayLayers*(y[W.format]||4)*(W.mipLevelCount>1?1.33:1)/1048576;return g.set(W,J),T.alloc+=J,C(),W},oe.destroy=function(){const ee=g.get(this);return ee&&(T.freed+=ee,g.delete(this),C()),X.call(this)})}P.createRenderPipeline=function(y){d.pipes++;try{Ie&&Te(y),pe(this,y.vertex),pe(this,y.fragment);const g=y.fragment&&y.fragment.targets;if(g){for(let C=0;C<g.length;C++)if(g[C]===void 0){if(me&&me[1]==="sparse")throw new TypeError("Type error (simulated sparse target)");g[C]=null,d.sparse=(d.sparse||0)+1,d.sparse<=10&&ke("PIPE_SPARSE '"+y.label+"' slot="+C+" of "+g.length+" fmts="+g.map($=>$?$.format:"null"))}}if(me&&me[1]==="all")throw new TypeError("Type error (simulated)");const T=this;T.pushErrorScope("validation");const F=ue.call(this,y);return T.popErrorScope().then(C=>{C&&(d.pipeInvalid=(d.pipeInvalid||0)+1)<=10&&ke("PIPE_INVALID '"+y.label+"' tgts="+(y.fragment&&y.fragment.targets?y.fragment.targets.map($=>$?$.format+($.blend?"+blend":""):"null"):"-")+" "+C.message.slice(0,160))},()=>{}),F}catch(g){return d.pipeThrown=(d.pipeThrown||0)+1,console.log("WGPU_PIPE_THROW '"+(y&&y.label)+"' "+g),d.pipeThrown<=10&&ke("PIPE_THROW '"+(y&&y.label)+"' "+g),Ue||(Ue=K.call(this,{code:"@vertex fn main() -> @builtin(position) vec4f { return vec4f(0); }"})),ue.call(this,{label:"invalid_after_throw",layout:"auto",vertex:{module:Ue,entryPoint:"nope"}})}},P.createComputePipeline=function(y){return pe(this,y.compute),ye.call(this,y)}};if(!new URLSearchParams(location.search).has("overrides")){xe();const m=globalThis.Worker;globalThis.Worker=class extends m{constructor(h,O){if(O&&String(O.name).startsWith("em-pthread")&&!O.type){const P=new URL(String(h),location.href).href;h=URL.createObjectURL(new Blob(["globalThis.__PT_SEARCH="+JSON.stringify(location.search)+";("+xe+")();importScripts("+JSON.stringify(P)+");"],{type:"text/javascript"}))}super(h,O)}}}j("loading Blender…");const ge=document.createElement("script");ge.src=vt()+".js",document.body.appendChild(ge)}Ve.onclick=()=>{ta()};ct();
