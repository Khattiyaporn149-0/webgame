// Lightweight config for the minigames sandbox
// You can edit positions, shapes, and which minigame to open.
// shape: { type: 'circle', r } OR { type: 'rect', w, h }
// kind: 'interact' | 'obstacle' (obstacle collides but does not open a game)
// game: one of 'dodge' | 'react' | 'aim' | 'tap' | 'iframe' | 'wires' | 'upload' | 'mix' | 'switch' | 'card' | 'timer' | 'align' (only for kind='interact')
// when game='iframe', add src: 'relative/path/to/your/minigame.html'

window.MINIGAMES_CONFIG = {
  world: { width: 800, height: 450, playerSpeed: 210, playerRadius: 16 },
  objects: [
    { key: 'dodge', kind: 'interact', label: 'Dodge Square', x: 620, y: 300, color: '#FFD54F', shape: { type: 'circle', r: 28 }, game: 'dodge' },
    { key: 'react', kind: 'interact', label: 'Reaction', x: 220, y: 140, color: '#52E0FF', shape: { type: 'circle', r: 26 }, game: 'react' },
    { key: 'aim',   kind: 'interact', label: 'Aim Trainer', x: 420, y:  90, color: '#FF8A80', shape: { type: 'circle', r: 26 }, game: 'aim' },
    // Example rectangular obstacle (a wall)
    { key: 'wall1', kind: 'obstacle', x: 360, y: 200, color: '#5C6BC0', shape: { type: 'rect', w: 140, h: 18 } },
    // New minigame spots you added
    { key:'speedtap', kind: 'interact', label:'Speed Tap', x: 150, y: 360, color:'#FF80AB', shape:{ type:'circle', r: 26 }, game:'tap' },
    { key:'reflex',   kind: 'interact', label:'Reflex Dodge', x: 400, y: 370, color:'#80DEEA', shape:{ type:'circle', r: 28 }, game:'dodge' },

    // Among Us-like tasks from world.html
    { key:'wires',  kind:'interact', label:'Fix Wiring',   x: 280, y: 280, color:'#FFD740', shape:{ type:'circle', r: 28 }, game:'wires' },
    { key:'upload', kind:'interact', label:'Upload Data',  x: 500, y: 260, color:'#64B5F6', shape:{ type:'circle', r: 28 }, game:'upload' },
    { key:'mix',    kind:'interact', label:'Mix Chemical', x: 700, y: 300, color:'#81C784', shape:{ type:'circle', r: 28 }, game:'mix' },
    { key:'switch', kind:'interact', label:'Power Switch', x: 200, y: 400, color:'#90CAF9', shape:{ type:'circle', r: 28 }, game:'switch' },
    { key:'card',   kind:'interact', label:'Swipe Card',   x: 430, y: 420, color:'#FFB74D', shape:{ type:'circle', r: 28 }, game:'card' },
    { key:'timer',  kind:'interact', label:'Perfect Timer',x: 660, y: 420, color:'#CE93D8', shape:{ type:'circle', r: 28 }, game:'timer' },
    { key:'align',  kind:'interact', label:'Align Engine', x: 780, y: 240, color:'#4DB6AC', shape:{ type:'circle', r: 28 }, game:'align' },
    // Extra minigames
    { key:'simon', kind:'interact', label:'Simon Says', x: 240, y: 210, color:'#9C27B0', shape:{type:'circle', r:26}, game:'simon' },
    { key:'pipes', kind:'interact', label:'Pipe Connect', x: 560, y: 210, color:'#00BCD4', shape:{type:'circle', r:26}, game:'pipes' },
    { key:'math',  kind:'interact', label:'Quick Math',  x: 720, y: 160, color:'#8BC34A', shape:{type:'circle', r:26}, game:'math' },
    { key:'lights', kind:'interact', label:'Lights Out',  x: 250, y: 180, color:'#FFC107', shape:{type:'circle', r:26}, game:'lights' },
    { key:'mole',   kind:'interact', label:'Whack-a-Mole', x: 340, y: 420, color:'#FF7043', shape:{type:'circle', r:26}, game:'mole' },
    { key:'slider', kind:'interact', label:'Slider Puzzle', x: 680, y: 200, color:'#8D6E63', shape:{type:'circle', r:26}, game:'slider' },
    { key:'rhythm',kind:'interact', label:'Rhythm Tap',  x: 320, y: 340, color:'#E91E63', shape:{type:'circle', r:26}, game:'rhythm' },
    { key:'pattern',kind:'interact',label:'Pattern Lock',x: 620, y: 360, color:'#3F51B5', shape:{type:'circle', r:26}, game:'pattern' },
    // New: Mop the Floor
    { key:'mop', kind:'interact', label:'Mop Floor', x: 520, y: 360, color:'#4FC3F7', shape:{ type:'circle', r:26 }, game:'mop' },
  ],
};
