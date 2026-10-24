/* Original village presentation. The rules and private projections stay in LanternCore. */
(() => {
  "use strict";
  const { SceneRenderer, VoteOutSequence, clamp } = window.LanternCore;
  const TAU = Math.PI * 2;
  const INK = "#3c422d";
  const smooth = (v) => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
  const mix = (a, b, t) => a + (b - a) * t;
  const imageAsset = (source) => {
    const image = new Image();
    image.src = source;
    return image;
  };

  class LanternSceneRenderer extends SceneRenderer {
    constructor(engine, canvas) {
      super(engine, canvas);
      this.art = {
        terrain: imageAsset("assets/village-terrain.webp"),
        cottage: imageAsset("assets/cottage.webp"),
      };
      this.focus = { x: 720, y: 450, amount: 0 };
      // Keep the shared map object: the engine and online projections attach these
      // exact house objects to players, and use their ids for target selection.
      this.map.layout = (players) => {
        const rx = this.portrait ? 296 : 465;
        const ry = this.portrait ? 298 : 251;
        this.map.houses = players.map((player, index) => {
          const angle = -Math.PI / 2 + index / Math.max(1, players.length) * TAU;
          return { id: player.id, x: 720 + Math.cos(angle) * rx,
            y: 448 + Math.sin(angle) * (Math.sin(angle) > 0 ? (this.portrait ? 350 : 330) : ry), angle };
        });
        players.forEach((player, index) => {
          player.house = this.map.houses[index];
          if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) {
            player.x = player.house.x;
            player.y = player.house.y + 40;
          }
        });
      };
      this.map.meeting = (player, count) => {
        const index = this.map.houses.findIndex((house) => house.id === player.id);
        const angle = -Math.PI / 2 + Math.max(0, index) / Math.max(1, count) * TAU;
        return { x: 720 + Math.cos(angle) * (this.portrait ? 180 : 254),
          y: 459 + Math.sin(angle) * (this.portrait ? 193 : 143) };
      };
      this.resize();
    }

    resize() {
      super.resize();
      this.scale = this.portrait
        ? Math.min(this.w / 830, (this.h - 95) / 940)
        : Math.min(this.w / 1510, (this.h - 55) / 900);
      const players = (this.e.state || this.e.preview)?.players;
      if (players) this.map.layout(players);
    }

    transform() {
      const focus = this.focus || { x: 720, y: 450, amount: 0 };
      const zoom = 1 + focus.amount * (this.portrait ? 1.65 : 1.15);
      const z = this.scale * this.zoom * zoom;
      return { z, ox: this.w / 2 - focus.x * z + this.pan.x,
        oy: this.h * (this.portrait ? 0.46 : 0.49) - focus.y * z + this.pan.y };
    }

    hit(x, y) {
      const point = this.point(x, y);
      const players = (this.e.state || this.e.preview)?.players || [];
      if (!this.e.state || !["night", "resolve"].includes(this.e.state.phase)) {
        const player = [...players].sort((a, b) => b.y - a.y).find((p) =>
          p.alive && Math.abs(point.x - p.x) < 26 && point.y > p.y - 67 && point.y < p.y + 14);
        if (player) return player.id;
      }
      const house = [...this.map.houses].sort((a, b) => b.y - a.y).find((h) =>
        Math.abs(point.x - h.x) < (this.portrait ? 67 : 82) &&
        point.y > h.y - (this.portrait ? 116 : 137) && point.y < h.y + 22);
      return house ? house.id : null;
    }

    text(value, x, y, size = 14, color = INK, align = "center", outline = false) {
      const c = this.c;
      c.font = `600 ${size}px "Nunito", "Trebuchet MS", sans-serif`;
      c.textAlign = align;
      c.textBaseline = "alphabetic";
      if (outline) {
        c.strokeStyle = this.night > 0.4 ? "#142a38aa" : "#f4efd3cc";
        c.lineWidth = Math.max(2.5, size * 0.2);
        c.lineJoin = "round";
        c.strokeText(String(value), x, y);
      }
      c.fillStyle = color;
      c.fillText(String(value), x, y);
    }

    transition(phase) {
      super.transition(phase);
      // The DOM toolbar carries phase/timer; the village never becomes a title card.
      this.banner = null;
    }

    terrain() {
      const c = this.c;
      const art = this.art?.terrain;
      c.fillStyle = "#678e45";
      c.fillRect(-2000, -1600, 5440, 4100);
      if (art?.complete && art.naturalWidth) {
        const tr = this.transform(), aspect = art.naturalWidth / art.naturalHeight;
        const centerX = (this.w / 2 - tr.ox) / tr.z;
        const centerY = (this.h / 2 - tr.oy) / tr.z;
        const width = Math.max(1680, this.w / tr.z + Math.abs(centerX - 720) * 2,
          (this.h / tr.z + Math.abs(centerY - 450) * 2) * aspect);
        const height = width / aspect;
        c.drawImage(art, 720 - width / 2, 450 - height / 2, width, height);
      } else {
        const grass = c.createLinearGradient(0, 0, 0, 960);
        grass.addColorStop(0, "#7e9e50");
        grass.addColorStop(1, "#648b42");
        c.fillStyle = grass;
        c.fillRect(-100, -65, 1640, 1010);
        this.ellipse(720, 470, 373, 244, "#a6ab60");
        this.ellipse(720, 461, 354, 225, "#c4ad70");
        this.ellipse(720, 454, 335, 211, "#cbb77a");
        this.ellipse(1410, 570, 145, 345, "#6b9f9c");
        this.ellipse(1425, 555, 115, 345, "#80b9bd");
        [[75,180,1.3],[205,80,.9],[1325,150,1.2],[125,740,1.1],
          [1305,815,1.2],[400,850,.8],[1190,45,.8]].forEach((tree) => this.tree(...tree));
      }
      // Very quiet, continuous motion belongs to the landscape, not the HUD.
      c.save();
      c.globalAlpha = 0.2;
      for (let i = 0; i < 11; i++) {
        const x = 1330 + (i % 3) * 26;
        const y = 255 + i * 36;
        this.path([[x, y], [x + 14 + Math.sin(this.time * 1.4 + i) * 5, y - 1]], "#f3f6d9", 1.5);
      }
      c.globalAlpha = 0.32;
      for (let i = 0; i < 42; i++) {
        const x = 70 + ((i * 197) % 1310), y = 105 + ((i * 139) % 735);
        const away = ((x - 720) / 425) ** 2 + ((y - 460) / 295) ** 2;
        if (away < 1 || this.map.houses.some((h) => Math.abs(x - h.x) < 92 && Math.abs(y - h.y) < 120)) continue;
        const sway = Math.sin(this.time * 1.4 + i * 2) * 2;
        this.path([[x - 3, y], [x - 5 + sway, y - 6], [x, y - 1], [x + 2 + sway, y - 8]], "#476c38", 1);
      }
      c.restore();
      if (this.night > 0) {
        c.fillStyle = `rgba(16,35,61,${this.night * 0.64})`;
        c.fillRect(-2000, -1600, 5440, 4100);
      }
      // A warm afternoon light, a cool evening wash and a quiet center to gather.
      if (this.night < 0.9) {
        const sunlight = c.createRadialGradient(460, 160, 30, 600, 340, 850);
        sunlight.addColorStop(0, `rgba(255,236,161,${(1 - this.night) * 0.11})`);
        sunlight.addColorStop(1, "#fff2a900");
        c.fillStyle = sunlight;
        c.fillRect(-100, -65, 1640, 1010);
      }
    }

    tree(x, y, scale = 1) {
      const c = this.c;
      c.save(); c.translate(x, y); c.scale(scale, scale);
      this.ellipse(18, 12, 47, 18, "#243c2b28");
      this.path([[-8,0],[-7,-63],[5,-78],[10,-5]], "#736345", 1.3, true, "#9a8051");
      this.path([[0,-35],[26,-64]], "#876e49", 6);
      [[-23,-76,30,33,"#668443"],[17,-91,34,38,"#749748"],[-6,-113,32,32,"#88a657"],[39,-69,23,27,"#739346"]].forEach(([a,b,rx,ry,color]) => this.ellipse(a,b,rx,ry,color,"#4f6b3a",1.2));
      c.restore();
    }

    house(h, player) {
      if (!player) return;
      const c = this.c, night = this.night;
      const selected = this.e.selected === player.id;
      const over = this.hover === player.id;
      const valid = (this.e.validTargets?.() || []).some((target) => target.id === player.id);
      const width = this.portrait ? 150 : 178, height = width * 0.88;
      const dead = !player.alive;
      c.save(); c.translate(h.x, h.y);
      const cinematic = this.nightFocus();
      if (cinematic && cinematic.house.id !== h.id && !cinematic.subjects?.some((target) => target.house.id === h.id))
        c.globalAlpha *= 1 - cinematic.amount * .88;
      c.save(); c.translate(24, 12); c.rotate(-0.2); c.filter = "blur(3px)";
      this.ellipse(0, 0, width * 0.5, 20, `rgba(35,48,29,${0.18 + night * .1})`);
      c.restore();
      if (valid || selected || over) {
        c.save();
        c.setLineDash(valid && !selected ? [3, 6] : []);
        c.strokeStyle = selected ? "#ffe3a0" : over ? "#fdf8d0" : "#c3e1c0";
        c.lineWidth = selected ? 2.5 : 1.5;
        c.beginPath(); c.ellipse(0, 10, width * .52, 24, 0, 0, TAU); c.stroke();
        c.restore();
      }
      const art = this.art?.cottage;
      c.save();
      if (dead) c.filter = "saturate(.32) brightness(.84)";
      else if (night > .01) c.filter = `brightness(${1 - night * .43}) saturate(${1 - night * .12})`;
      if (art?.complete && art.naturalWidth) {
        c.drawImage(art, -width / 2, -height + 12, width, height);
      } else this.cottageFallback(width, height);
      c.restore();
      if (night > .03 && !dead) {
        const glow = c.createRadialGradient(-width*.21, -height*.35, 0, -width*.21, -height*.35, width*.43);
        glow.addColorStop(0, `rgba(255,209,116,${night*.28})`);
        glow.addColorStop(1, "#ffd17400");
        c.fillStyle = glow; c.fillRect(-width*.68,-height*.8,width*1.2,height);
        // Local warm spill is deliberately broad: the cottage art's own windows
        // remain visible without an incorrectly aligned replacement rectangle.
        c.save(); c.globalAlpha = night * .4; c.globalCompositeOperation = "screen";
        this.path([[280,738],[427,821],[427,968],[276,877]].map(([px,py]) => [width*(px/1280-.5),-height+12+height*py/1280]),"#ffd39300",0,true,"#ffcf86");
        c.restore();
        this.ellipse(width*.1, 16, 30, 8, `rgba(255,209,130,${night*.09})`);
      }
      if (dead) {
        this.path([[-8,-9],[22,8]], "#624e3b", 6);
        this.path([[-8,-9],[22,8]], "#b59a72", 3.5);
      }
      if ((night > .25 || selected || over) && !(cinematic?.amount > .1)) {
        this.text(player.name || "YOU", 0, 37, 12, night > .4 ? "#f2ecd1" : "#3b4832", "center", true);
      }
      if (cinematic?.house.id === h.id && cinematic.amount > .4) {
        this.text(player.name, 0, -height - 8, 12, "#ede5c9", "center", true);
      }
      if (selected) {
        this.path([[-5,-height-2],[0,-height+4],[5,-height-2]], "#ffe29a", 2.5);
      }
      c.restore();
    }

    cottageFallback(width, height) {
      const c = this.c;
      c.save(); c.scale(width / 178, height / 156.6);
      this.path([[-67,-76],[22,-68],[66,-83],[66,0],[17,17],[-67,0]], "#655a40", 1.4, true, "#e3d4a5");
      this.path([[17,-68],[66,-83],[66,0],[17,17]], "#766744", 1.2, true, "#cbb88e");
      this.path([[-82,-73],[-24,-135],[80,-98],[28,-48]], "#554a34", 1.5, true, "#776344");
      this.path([[-24,-135],[80,-98],[64,-79],[28,-48]], "#564a35", 1.2, true, "#8c704b");
      for (let i=0;i<5;i++) this.path([[-69+i*10,-82-i*10],[17+i*10,-57-i*10]], "#5d503b", .8);
      this.round(-53,-58,40,31,2,"#b4d6d7","#796f51",1.3);
      this.path([[-51,-56],[-26,-28]], "#ecf4dc99", 4);
      this.round(25,-50,28,58,[14,14,1,1],"#9d8258","#6b5c40",1.3);
      this.path([[35,-41],[35,8]], "#7c674b", .8);
      this.path([[43,-43],[43,6]], "#7c674b", .8);
      this.ellipse(47,-14,1.5,1.5,"#d5bf7a");
      c.restore();
    }

    character(player, scale = 1, label = true) {
      const c = this.c;
      const reduced = this.e.settings?.reduced;
      const moving = !player.still && !reduced && Math.hypot(player.x - player.tx, player.y - player.ty) > 5;
      const t = this.time * 10 + (player.id || 0) * 2;
      const stride = moving ? Math.sin(t) * 3 : 0;
      const color = player.color || "#d9bc7b";
      c.save(); c.translate(player.x, player.y); c.scale(scale, scale);
      c.save(); c.translate(8, 8); c.rotate(-.28);
      this.ellipse(0, 0, 21, 8, this.night > .3 ? "#06172940" : "#34412536");
      c.restore();
      if (label && (this.e.selected === player.id || this.hover === player.id)) {
        c.strokeStyle = this.e.selected === player.id ? "#ffe8a1" : "#fff7d9";
        c.lineWidth = 1.7; c.beginPath(); c.ellipse(0, 5, 27, 11, 0, 0, TAU); c.stroke();
      }
      c.translate(0, moving ? -Math.abs(Math.sin(t)) * 1.5 : 0);
      c.rotate(player.still || reduced ? 0 : moving ? Math.sin(t) * .035 : Math.sin(this.time * 1.2 + player.id) * .012);
      // A compact pear silhouette, little arms and soft feet. No eyes/goggles
      // dominate the face; customization is purely public color/hat/accessory.
      this.round(-11,-8,8,17+stride,4,color,INK,1.05);
      this.round(4,-8,8,17-stride,4,color,INK,1.05);
      this.ellipse(-18,-23-stride*.4,5,12,color,INK,1.05);
      this.ellipse(18,-23+stride*.4,5,12,color,INK,1.05);
      c.beginPath(); c.moveTo(-16,-2); c.bezierCurveTo(-23,-9,-18,-27,-18,-37);
      c.bezierCurveTo(-19,-66,18,-66,18,-37); c.bezierCurveTo(17,-24,23,-9,16,-2);
      c.bezierCurveTo(7,2,-8,2,-16,-2); c.closePath();
      const body = c.createLinearGradient(-19,-30,23,-17);
      body.addColorStop(0,color); body.addColorStop(.64,color); body.addColorStop(1,"#465446");
      c.fillStyle = body; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.1; c.stroke();
      this.ellipse(-7,-48,7,3,"#ffffff21");
      if (player.deadFace) {
        [-6,6].forEach((x)=> {this.path([[x-2,-37],[x+2,-33]],INK,1.1);this.path([[x+2,-37],[x-2,-33]],INK,1.1);});
      } else if (Math.sin((this.time + (player.blink || 0)) * 1.2) > .998) {
        this.path([[-8,-35],[-4,-35]],INK,1.3); this.path([[4,-35],[8,-35]],INK,1.3);
      } else {
        this.ellipse(-6,-35,1.5,2.2,"#283129"); this.ellipse(6,-35,1.5,2.2,"#283129");
      }
      this.path([[-2,-29],[0,-28],[2,-29]],"#3b4230",.9);
      if (player.doomed) this.ellipse(0,-28,1.5,2.2,INK);
      if (player.accessory === "scarf") {
        this.round(-15,-18,30,5,2,"#f1d38c",null);
        this.path([[8,-15],[10,-3]],"#e5bd76",5);
      }
      // Small round spectacles are optional appearance, never a role cue.
      if (player.glasses) {
        this.ellipse(-6,-35,5.3,5.3,"#b5dbdc15","#5a604a",.85);
        this.ellipse(6,-35,5.3,5.3,"#b5dbdc15","#5a604a",.85);
        this.path([[-.7,-35],[.7,-35]],"#5a604a",.85);
      }
      this.hat(player.hat);
      if (label) {
        const own = player.id === 0;
        this.text(player.name || (own ? "YOU" : ""),0,28,12,this.night>.4?"#f2efda":"#33402d","center",true);
        if (own) this.ellipse(0,-72,2.5,2.5,"#ffebac", "#947d49",.8);
      }
      c.restore();
    }

    hat(name) {
      const c = this.c;
      if (name === "leaf") {
        c.save(); c.translate(2,-58); c.rotate(-.35);
        this.ellipse(6,-3,12,5,"#688958","#3f593a",1);
        this.path([[-4,0],[15,-5]],"#acc17b",.9); c.restore();
      } else if (name === "cap") {
        this.round(-17,-63,32,12,[13,13,0,0],"#6c7e9a","#424c56",1);
        this.ellipse(-10,-51,18,3,"#5b6e8b","#424c56",1);
      } else if (name === "flower") {
        for(let i=0;i<5;i++) this.ellipse(13+Math.cos(i/5*TAU)*5,-56+Math.sin(i/5*TAU)*5,3.8,3.8,"#e9a4ac","#a56676",.65);
        this.ellipse(13,-56,2.8,2.8,"#f0ce7c","#b08d4e",.6);
      } else if (name === "crown") {
        this.path([[-15,-53],[-17,-67],[-8,-61],[0,-72],[8,-61],[17,-67],[15,-53]],"#9b7c42",1,true,"#e7c572");
      }
    }

    speech(player) {
      if (!player.alive || player.bubbleTime <= 0 || this.night > .4 || this.e.screen !== "game" || this.e.state?.phase === "verdict") return;
      const text = String(player.bubble || "…");
      const short = text.length > 28 ? text.slice(0,26)+"…" : text;
      const c = this.c; c.font = '600 11px "Nunito",sans-serif';
      const width = Math.min(182,Math.max(38,c.measureText(short).width+22));
      this.round(player.x-width/2,player.y-101,width,25,8,"#f7f1dce8","#7f8867",.9);
      this.path([[player.x-3,player.y-76],[player.x,player.y-71],[player.x+4,player.y-76]],"#7f8867",.9,false,"#f7f1dc");
      this.text(short,player.x,player.y-84,11,"#44513a");
    }

    votes(dt) {
      const e = this.e, s = e.state;
      if (!s || !["vote","verdict"].includes(s.phase)) return;
      for (const player of s.players.filter((p)=>p.alive)) {
        const count = (e.visibleVotes || []).filter((vote)=>vote.target===player.id).length;
        if (!count) continue;
        this.ellipse(player.x+20,player.y-57,10,10,"#ead596","#92845c",1);
        this.text(count,player.x+20,player.y-53,11,"#4c4a36");
      }
      // This override intentionally consumes no extra clock; ballots are authoritative.
      this.voteFlights = this.voteFlights.filter((flight)=>(flight.life += dt)<.8);
    }

    nightVisitor(x, y, healer = false, alpha = 1, reach = 0) {
      // No player data enters this method. Every visitor has exactly this shape.
      const c = this.c;
      c.save(); c.translate(x,y); c.globalAlpha *= alpha;
      this.ellipse(8,8,24,8,"#07152155");
      this.path([[-18,0],[-15,-31],[-15,-44],[-10,-59],[0,-65],[11,-59],[16,-44],[15,-30],[20,0]],healer?"#7d9295":"#243544",1.1,true,healer?"#b6c9c3":"#293943");
      this.ellipse(0,-43,9,11,healer?"#647d7e":"#17262f",null);
      this.path([[12,-25],[23+reach*13,-26-reach*9]],healer?"#b6c9c3":"#293943",7);
      if (healer) {
        this.round(-5,-24,10,12,2,"#e4e3ca",null);
        this.path([[-3,-18],[3,-18]],"#6a9a81",2);
        this.path([[0,-21],[0,-15]],"#6a9a81",2);
      } else if (reach > .1) {
        this.path([[24+reach*13,-29-reach*9],[28+reach*13,-44-reach*9]],"#d4d9c7",2.5);
      }
      c.restore();
    }

    nightFocus() {
      const sequence = this.e.nightSequence;
      if (this.e.state?.phase !== "resolve" || !sequence || sequence.done) return null;
      const scene = sequence.current;
      const subject = scene.kind === "blast" && scene.targets?.length ? scene.targets[0].subject : scene.subject;
      const player = this.e.visiblePlayer(subject ?? 0);
      const house = this.map.houses.find((h)=>h.id===player?.id);
      if (!house) return null;
      const duration = sequence.durations[sequence.index] || 6.6;
      const amount = smooth(sequence.time / .8) * (1 - smooth((sequence.time-duration+.8)/.8));
      if (scene.kind === "blast" && scene.targets?.length) {
        const subjects = scene.targets.map((target) => {
          const resident = this.e.visiblePlayer(target.subject);
          return { player: resident, house: this.map.houses.find((h) => h.id === resident?.id), outcome: target.outcome };
        }).filter((target) => target.house && target.player);
        if (subjects.length) return { x: subjects.reduce((sum,target) => sum+target.house.x,0)/subjects.length,
          y: subjects.reduce((sum,target) => sum+target.house.y,0)/subjects.length+26,
          amount: amount*.15, house, player, scene, subjects, time: sequence.time };
      }
      return { x: house.x, y: house.y+26, amount, house, player, scene, time: sequence.time };
    }

    drawNightScene(override = null) {
      const focus = override || this.nightFocus();
      if (!focus) return;
      const { house, player, scene, time:t } = focus;
      if (focus.subjects) {
        for (const target of focus.subjects) this.drawNightScene({ ...focus, subjects: null,
          ...target, scene: { kind: "attack", style: "blast", outcome: target.outcome } });
        return;
      }
      const c = this.c, x = house.x + 10, y = house.y + 67;
      const combat = ["attack","death","save","vest","blast"].includes(scene.kind);
      const shield = scene.kind === "vest" || scene.outcome === "blocked";
      const saved = scene.kind === "save";
      const recovery = saved ? smooth((t-3.6)/1.35) : 0;
      const fall = combat && !shield ? smooth((t-2)/.5)*(1-recovery) : 0;
      const direction = house.x < 720 ? 1 : -1;
      const approach = smooth(t/1.85), leave = smooth((t-5.25)/1.1);
      c.save();
      const pool = c.createRadialGradient(x,y-20,4,x,y-20,125);
      pool.addColorStop(0,"#f9e3a815"); pool.addColorStop(1,"#e6d39400");
      c.fillStyle=pool; c.fillRect(x-150,y-165,300,260);
      if (combat) {
        const attackX = mix(x + direction*175,x+direction*42,approach)+direction*leave*160;
        if(scene.style !== "blast" && (t<3.25 || !saved)) this.nightVisitor(attackX,y-7,false,1-smooth((t-5.5)/.8),Math.sin(smooth((t-1.65)/.45)*Math.PI));
        c.save(); c.translate(x,y);
        c.rotate(-direction*fall*Math.PI*.49);
        if (fall>.9) c.globalAlpha=.82;
        this.character({...player,x:0,y:0,tx:0,ty:0,still:true,deadFace:fall>.9&&!saved,doomed:fall>.1},1.12,false);
        c.restore();
        if(saved && t>2.9) {
          const arrival=smooth((t-2.9)/1.05), departure=smooth((t-5.25)/1.05);
          this.nightVisitor(mix(x-direction*170,x-direction*43,arrival)-direction*departure*150,y-1,true,smooth((t-2.9)/.35)*(1-smooth((t-5.6)/.8)),recovery);
          if(t>3.6&&t<5.55) {
            c.save(); c.globalAlpha=Math.sin(clamp((t-3.6)/1.95,0,1)*Math.PI)*.7;
            const ring=28+smooth((t-3.6)/1.8)*35;
            this.ellipse(x,y-17,ring,ring*.63,"#b5e1bd15","#bee6c7",1.6);
            for(let i=0;i<5;i++) this.ellipse(x+Math.cos(i/5*TAU)*29,y-10-(t-3.6)*24-i*4,1.8,1.8,"#e4f0b9");
            c.restore();
          }
        }
        if(shield && t>1.8 && t<4.9) {
          c.save();c.globalAlpha=Math.min(smooth((t-1.8)/.3),1-smooth((t-4.3)/.6));
          this.ellipse(x,y-29,34,45,"#bfded821","#c8e2d7",1.5);c.restore();
        }
        if(t>2&&t<2.55) {
          const impact=1-smooth((t-2)/.55);
          c.save();c.globalAlpha=impact;
          for(let i=0;i<6;i++) {const angle=i/6*TAU;this.path([[x+Math.cos(angle)*24,y-31+Math.sin(angle)*24],[x+Math.cos(angle)*38,y-31+Math.sin(angle)*38]],scene.style==="blast"?"#efc789":"#f1dfb6",1.8);}
          c.restore();
        }
      } else {
        this.character({...player,x,y,tx:x,ty:y,still:true},1.1,false);
        if(["protect","heal"].includes(scene.kind)) this.ellipse(x,y-24,33,42,"#bfe1c315","#bbd9bd",1.2);
        if(["sleep","cast"].includes(scene.kind)) this.text(t>1.4?"z":"·",x+26,y-56,15,"#d8dfce");
        if(scene.kind!=="sleep"&&t<2.8) this.nightVisitor(mix(x+direction*130,x+direction*45,smooth(t/1.4)),y-7,false,1-smooth((t-2.3)/.5));
      }
      const caption = saved ? t<2?"HOLD ON…":t<3.6?"HOLD ON…":t<4.9?"REVIVING…":"SAVED!"
        : shield ? t<2?"HOLD ON…":"PROTECTED!"
        : combat ? t<2?"HOLD ON…":scene.kind==="death"?"YOU WERE KILLED":"ATTACK LANDED"
        : scene.kind==="sleep"?"RESTING…":scene.outcome==="blocked"?"ACTION BLOCKED":scene.kind==="protect"?"PROTECTION SET":"ACTION COMPLETE";
      this.text(caption,x,y+43,13,saved?"#d5edca":"#eee4c8","center",true);
      c.restore();
    }

    drawVoteOut() {
      const sequence = this.e.voteOut;
      if (!sequence || this.e.state?.phase !== "verdict") return;
      const c=this.c, times=VoteOutSequence.TIMES, at=sequence.position;
      this.ellipse(720,480,62,23,"#efe1ac38","#d6c58b",1);
      const actor={...sequence.appearance,x:at.x,y:at.y,tx:720,ty:480,alive:true,doomed:true};
      if(sequence.elapsed<times.death) this.character(actor,1.15,false);
      else {
        const fall=smooth((sequence.elapsed-times.death)/.65);
        c.save();c.translate(720,480);c.rotate(fall*Math.PI*.49);c.globalAlpha=.9;
        this.character({...actor,x:0,y:0,tx:0,ty:0,still:true,deadFace:true},1.15,false);c.restore();
        if(sequence.elapsed<times.reveal) {
          c.save();c.globalAlpha=1-smooth((sequence.elapsed-times.death)/1.5);
          for(let i=0;i<5;i++) this.ellipse(720+Math.cos(i/5*TAU+this.time)*37,439+Math.sin(i/5*TAU+this.time)*13,2,2,"#eee3b8");
          c.restore();
        }
      }
      this.text(sequence.appearance.name,720,538,13,"#3e4732","center",true);
      if(sequence.roleVisible) this.text("ELIMINATED",720,389,20,"#f6eed0","center",true);
    }

    effect(effect, dt) {
      effect.maxLife ??= effect.life; effect.life-=dt;
      if(effect.life<=0) return false;
      const house=this.map.houses.find((h)=>h.id===effect.target);
      if(!house) return false;
      const age=1-effect.life/effect.maxLife,c=this.c;
      c.save();c.globalAlpha=(1-age)*.5;
      this.ellipse(house.x,house.y+9,65+age*25,20+age*9,"#e9dfad00",effect.type==="shield"?"#d1e6cc":"#ecdfb4",1.4);c.restore();
      return true;
    }

    draw(dt) {
      const e=this.e,s=e.state,players=(s||e.preview)?.players||[];
      const frozen=e.paused||e.modalPaused;
      const motionDt=frozen?0:dt;
      this.time+=e.settings?.reduced?motionDt*.3:motionDt;
      const desiredNight=s&&["night","resolve"].includes(s.phase)?1:0;
      this.night=mix(this.night,desiredNight,Math.min(1,motionDt*1.4));
      const focus=this.nightFocus();
      const amount=focus?.amount||0;
      // Derive the cinematic framing from the same sequence clock as the action.
      // No independent timers continue while the game is paused.
      const follow=frozen?0:e.settings?.reduced?1:Math.min(1,motionDt*5);
      this.focus.amount=mix(this.focus.amount,amount,follow);
      this.focus.x=mix(this.focus.x,mix(720,focus?.x||720,amount),follow);
      this.focus.y=mix(this.focus.y,mix(450,focus?.y||450,amount),follow);
      const c=this.c,tr=this.transform();
      c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.w,this.h);
      c.translate(tr.ox,tr.oy);c.scale(tr.z,tr.z);
      this.shake=0;
      this.terrain();
      if(s?.phase==="night"&&e.nightTarget!==null&&players[0]?.alive) {
        const from=players[0].house,to=this.map.houses.find((h)=>h.id===e.nightTarget);
        if(from&&to) {
          c.save();c.strokeStyle="#ebdfac88";c.lineWidth=1.4;c.setLineDash([2,9]);c.lineDashOffset=-this.time*9;
          c.beginPath();c.moveTo(from.x,from.y+20);c.quadraticCurveTo(720,470,to.x,to.y+20);c.stroke();c.restore();
        }
      }
      const queue=this.map.houses.map((house)=>({y:house.y+17,draw:()=>this.house(house,e.visiblePlayer?.(house.id)||players.find((p)=>p.id===house.id))}));
      for(const player of players) {
        if(s?.phase==="verdict"&&e.voteOut?.target===player.id) continue;
        const day=!s||["reveal","day","vote","verdict","morning","end"].includes(s.phase);
        const target=day?this.map.meeting(player,players.length):{x:player.house.x,y:player.house.y+15};
        if(!Number.isFinite(player.x)) {player.x=target.x;player.y=target.y;}
        player.tx=target.x;player.ty=target.y;
        const speed=frozen?0:e.settings?.reduced?1:Math.min(1,motionDt*3.1);
        player.x=mix(player.x,player.tx,speed);player.y=mix(player.y,player.ty,speed);
        player.bubbleTime=Math.max(0,(player.bubbleTime||0)-motionDt);
        const hidden=!day&&Math.hypot(player.x-player.tx,player.y-player.ty)<17;
        const visible=e.visiblePlayer?.(player.id)||player;
        if(visible.alive&&!hidden&&s?.phase!=="resolve") queue.push({y:player.y,draw:()=>this.character(player)});
      }
      queue.sort((a,b)=>a.y-b.y).forEach((item)=>item.draw());
      if(focus) this.drawNightScene();
      this.votes(motionDt);
      this.effects=this.effects.filter((effect)=>this.effect(effect,motionDt));
      this.particles.update(motionDt);this.particles.draw(c);
      this.drawVoteOut();
      if(s) players.filter((p)=>p.alive&&p.bubbleTime>0).slice(-3).forEach((p)=>this.speech(p));
      if(this.night>.5) {
        c.save();c.globalAlpha=this.night*.48;
        for(let i=0;i<15;i++) this.ellipse(260+((i*137)%940)+Math.sin(this.time*.7+i)*9,180+((i*79)%540)+Math.cos(this.time*.6+i)*6,1.4,1.4,"#f2e9af");
        c.restore();
      }
      c.setTransform(this.dpr,0,0,this.dpr,0,0);
      if(e.paused&&e.screen==="game") {
        c.fillStyle="#16273255";c.fillRect(0,0,this.w,this.h);
        this.text("PAUSED",this.w/2,this.h/2,34,"#f2ecd3");
      }
    }
  }
  window.LanternSceneRenderer=LanternSceneRenderer;
})();
