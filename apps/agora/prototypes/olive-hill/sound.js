// Original procedural sound design. Audio starts only on an explicit user gesture.
export class Soundscape {
  constructor(){this.active=false;this.ctx=null;this.timers=[];}
  async toggle(){if(!this.ctx)this.init();this.active=!this.active;if(this.active)await this.ctx.resume();this.master.gain.setTargetAtTime(this.active?.48:0,this.ctx.currentTime,.3);return this.active;}
  init(){this.ctx=new (window.AudioContext||window.webkitAudioContext)();const c=this.ctx;this.master=c.createGain();this.master.gain.value=0;this.master.connect(c.destination);
    const noise=c.createBuffer(1,c.sampleRate*8,c.sampleRate),data=noise.getChannelData(0);let smooth=0;for(let i=0;i<data.length;i++){smooth=(smooth+(Math.random()*2-1)*.025)/1.025;data[i]=smooth*4;}
    const air=c.createBufferSource();air.buffer=noise;air.loop=true;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=850;const g=c.createGain();g.gain.value=.25;air.connect(filter).connect(g).connect(this.master);air.start();
    const lfo=c.createOscillator(),depth=c.createGain();lfo.frequency.value=.085;depth.gain.value=.11;lfo.connect(depth).connect(g.gain);lfo.start();
    this.timers.push(setInterval(()=>{if(this.active&&!document.hidden)this.bird();},2700));
    this.timers.push(setInterval(()=>{if(this.active&&!document.hidden)this.music();},6200));this.music();this.bird();
  }
  tone(freq,time,length,volume=.08,type='sine',pan=0){const c=this.ctx,o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner();o.type=type;o.frequency.value=freq;p.pan.value=pan;g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume,time+.025);g.gain.exponentialRampToValueAtTime(.0001,time+length);o.connect(g).connect(p).connect(this.master);o.start(time);o.stop(time+length+.1);return o;}
  music(){const t=this.ctx.currentTime;const chords=[[146.83,220,293.66,329.63],[130.81,196,261.63,329.63],[164.81,220,293.66,440]];const chord=chords[Math.floor(Math.random()*chords.length)];chord.forEach((f,i)=>{this.tone(f,t+i*.42,4.8,.065,'sine',i/4-.4);this.tone(f*2,t+i*.42,2,.015,'triangle',.3);});}
  bird(){const c=this.ctx,t=c.currentTime,pan=Math.random()*1.6-.8;for(let i=0;i<3;i++){const o=this.tone(1900,t+i*.17,.13,.075,'sine',pan);o.frequency.exponentialRampToValueAtTime(3100+Math.random()*700,t+i*.17+.06);o.frequency.exponentialRampToValueAtTime(2200,t+i*.17+.13);}}
  chime(){if(!this.ctx||!this.active)return;[293.66,369.99,440,587.33].forEach((f,i)=>this.tone(f,this.ctx.currentTime+i*.12,1.5,.13));}
  visibility(hidden){if(!this.ctx)return;if(hidden)this.ctx.suspend();else if(this.active)this.ctx.resume().catch(()=>{});}
}
