import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validateNewEvent,combineEventDateTime} from '../src/lib/new-event.ts';
const raw=()=>({title:'Campus study session',category:'Study',location:'Science Library',startsAt:'2099-11-03T10:30',description:'Bring your notes for a focused study session.',meetingPoint:'Main entrance',bring:'Notes',capacity:'5'});
test('creation validation preserves normalized values and all existing field limits',()=>{
 const result=validateNewEvent({...raw(),title:'  Campus study session  ',location:' Science   Library '});assert.equal(result.ok,true);assert.equal(result.value.title,'Campus study session');assert.equal(result.value.location,'Science Library');assert.equal(result.value.capacity,5);
 const empty=validateNewEvent({title:' ',category:'',location:'',startsAt:'',description:'',meetingPoint:'x'.repeat(301),bring:'x'.repeat(301),capacity:'1'});assert.equal(empty.ok,false);assert.deepEqual(Object.keys(empty.errors).sort(),['title','category','location','startsAt','description','meetingPoint','bring','capacity'].sort());
 for(const capacity of ['','1','51','2.5','abc'])assert.equal(validateNewEvent({...raw(),capacity}).ok,false);
 for(const capacity of ['2','50'])assert.equal(validateNewEvent({...raw(),capacity}).ok,true);
 assert.equal(validateNewEvent({...raw(),startsAt:'2000-01-01T10:00'}).ok,false);
 assert.equal(validateNewEvent({...raw(),title:'x'.repeat(101)}).ok,false);assert.equal(validateNewEvent({...raw(),description:'x'.repeat(1001)}).ok,false);
});
test('separate date and time retain browser-local interpretation and UTC storage',()=>{
 const original=process.env.TZ;
 try {for(const [zone,expected]of [['America/Los_Angeles','2099-11-03T18:30:00.000Z'],['America/New_York','2099-11-03T15:30:00.000Z'],['UTC','2099-11-03T10:30:00.000Z']]){process.env.TZ=zone;const combined=combineEventDateTime('2099-11-03','10:30');assert.equal(combined,'2099-11-03T10:30');assert.equal(validateNewEvent({...raw(),startsAt:combined}).value.startsAt,expected);}}
 finally {if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});
test('invalid dates, missing parts, and nonexistent daylight-saving times are rejected',()=>{
 const original=process.env.TZ;try{process.env.TZ='America/Los_Angeles';for(const [date,time]of [['','10:00'],['2099-11-03',''],['2099-02-31','10:00'],['2099-11-03','25:00'],['2026-03-08','02:30']])assert.equal(combineEventDateTime(date,time),'');assert.equal(combineEventDateTime('2026-11-01','01:30'),'2026-11-01T01:30');}finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
});

test('custom categories are normalized and validated without restricting users to presets',()=>{
 const custom=validateNewEvent({...raw(),category:'  Board   Games  '});assert.equal(custom.ok,true);assert.equal(custom.value.category,'Board Games');
 assert.equal(validateNewEvent({...raw(),category:' food '}).value.category,'Food');
 for(const category of ['', 'x', 'All', 'ALL', 'x'.repeat(41), 'Bad\nCategory'])assert.equal(validateNewEvent({...raw(),category}).ok,false,category);
});
