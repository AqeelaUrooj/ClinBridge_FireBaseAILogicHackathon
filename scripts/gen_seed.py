# Generates src/data/downtimekit-seed.json (100% synthetic data). Run: python3 scripts/gen_seed.py && mv downtimekit-seed.json src/data/
import json, hashlib
from datetime import datetime, timedelta, timezone
TZ = timezone(timedelta(hours=-5))
def t(h, m=0, day=14): return datetime(2026, 11, day, h, m, tzinfo=TZ).isoformat()
def shift(iso, mins): return (datetime.fromisoformat(iso) + timedelta(minutes=mins)).isoformat()
db = {k: [] for k in ["snapshot","patient","encounter","allergy","active_order","snapshot_result","practitioner","device","downtime_event","entry","vital_sign","med_admin","intake_output","note","lab_event","worklist_item","handoff","audit_log","key_store"]}
UNIT = "4 West (Medical-Surgical)"
# ---------- B. context
staff = [("pr-park","Jordan Park","JP","RN",True),("pr-alvarez","Maria Alvarez","MA","RN",True),("pr-okafor","Daniel Okafor","DO","RN",True),
         ("pr-whitfield","Sara Whitfield","SW","LPN",True),("pr-ellis","Kim Ellis","KE","admin",True),("pr-nguyen","Tara Nguyen","TN","RN",False),
         ("pr-reyes","Ana Reyes","AR","RN",True)]
for i,(id_,n,ini,role,act) in enumerate(staff):
    db["practitioner"].append(dict(id=id_,name=n,initials=ini,role=role,pin_hash="FAKE-argon2id$v=19$m=65536$seed%02d$notarealhash"%i,active=act))
db["device"] += [dict(id="dev-01",label="DT-4W-01 (nurses' station laptop)",unit=UNIT,last_clock_sync=t(2,55),model_status="available"),
                 dict(id="dev-02",label="DT-4W-02 (medication room laptop)",unit=UNIT,last_clock_sync=t(21,10,day=11),model_status="available")]
db["downtime_event"].append(dict(id="dt-2026-11-14",declared_at=t(3,40),declared_by="pr-ellis",network_cleared_at=t(12,40),cleared_by="pr-ellis",ended_at=None))
# ---------- A. snapshot
pts = [  # id, mrn, family, given, dob, sex, bed, admit(day,h), attending, code, diet, isolation, h, w
 ("pt-01","DK-004512","Rivera","Sam","1959-03-12","male","4B",(12,16),"Dr. A. Whitaker","Full code","Cardiac, low salt",None,174,82.5),
 ("pt-02","DK-004518","Ortiz","Lena","1972-07-30","female","4C",(13,9),"Dr. P. Lindqvist","Full code","Consistent carbohydrate",None,162,71.0),
 ("pt-03","DK-004527","Mehta","Arjun","1955-01-21","male","5A",(11,22),"Dr. A. Whitaker","Full code","Renal, low potassium",None,169,76.4),
 ("pt-04","DK-004533","Bell","Grace","1987-09-04","female","5C",(13,14),"Dr. R. Castellano","Full code","Regular",None,167,64.2),
 ("pt-05","DK-004541","Hale","Tom","1944-05-17","male","6A",(10,11),"Dr. P. Lindqvist","DNR","Soft, thickened liquids","Contact",171,68.9),
 ("pt-06","DK-004546","Chen","Mei","1968-11-02","female","6B",(12,20),"Dr. R. Castellano","Full code","Regular",None,158,59.3),
 ("pt-07","DK-004552","Okoye","Daniel","1979-02-14","male","7A",(13,23),"Dr. A. Whitaker","Full code","Nothing by mouth (NPO)",None,181,90.1),
 ("pt-08","DK-004559","Santos","Rosa","1950-08-25","female","7B",(9,8),"Dr. P. Lindqvist","Full code","Cardiac, 1500 mL fluid limit",None,155,66.7),
 ("pt-09","DK-004563","Novak","Peter","1963-12-09","male","8A",(13,5),"Dr. R. Castellano","Full code","Regular","Droplet",177,84.0),
 ("pt-10","DK-004570","Rahman","Aisha","1991-04-18","female","8B",(13,18),"Dr. A. Whitaker","Full code","Clear liquids",None,164,61.8)]
for i,(id_,mrn,fam,giv,dob,sex,bed,(ad,ah),att,code,diet,iso,h,w) in enumerate(pts):
    db["patient"].append(dict(id=id_,mrn=mrn,family_name=fam,given_name=giv,birth_date=dob,sex=sex,wristband_barcode="WB"+mrn.replace("-","")))
    db["encounter"].append(dict(id="enc-"+id_[3:],patient_id=id_,visit_number="V2611%04d"%(310+i*7),unit=UNIT,bed=bed,admit_time=t(ah,0,day=ad),attending=att,code_status=code,diet=diet,isolation=iso,height_cm=h,weight_kg=w))
for i,(p,s,r,sev) in enumerate([("pt-01","Penicillin","Rash","moderate"),("pt-02","Sulfa antibiotics","Hives","moderate"),("pt-03","No known allergies",None,None),
    ("pt-04","Latex","Skin irritation","mild"),("pt-05","Codeine","Nausea and vomiting","moderate"),("pt-05","Shellfish","Throat swelling","severe"),
    ("pt-06","No known allergies",None,None),("pt-07","Morphine","Itching","mild"),("pt-08","Aspirin","Wheezing","severe"),("pt-09","No known allergies",None,None),("pt-10","Iodine contrast dye","Hives","moderate")]):
    db["allergy"].append(dict(id="alg-%02d"%(i+1),patient_id=p,substance=s,reaction=r,severity=sev,status="active"))
ROUTE = {"PO":"26643006","IV":"47625008","IM":"78421000","SC":"34206005","SL":"37839007","PR":"37161004","TOP":"6064005","NG":"127492001"}
O = {}
def order(oid, pt, typ, text, drug=None, dose=None, unit=None, route=None, freq=None, times=None, prn=False, by="Dr. A. Whitaker", rx=None, start=(13,8)):
    row = dict(id=oid,encounter_id="enc-"+pt[3:],type=typ,text=text,drug_name=drug,rxnorm_code=rx,dose=dose,dose_unit=unit,route=route,
        route_snomed=ROUTE.get(route),frequency=freq,scheduled_times=times,prn=prn,start=t(start[1],0,day=start[0]),stop=None,status="active",status_time=t(start[1],0,day=start[0]),ordered_by=by)
    db["active_order"].append(row); O[oid]=row
order("ord-01","pt-01","med","amLODIPine 5 mg by mouth once daily","amLODIPine",5,"mg","PO","daily",["09:00"])
order("ord-02","pt-01","med","metoprolol tartrate 25 mg by mouth twice daily","metoprolol tartrate",25,"mg","PO","twice daily",["09:00","21:00"])
order("ord-03","pt-01","nursing","Vital signs every 4 hours",freq="every 4 hours",times=["00:00","04:00","08:00","12:00","16:00","20:00"])
order("ord-04","pt-02","med","insulin lispro 4 units under the skin with meals","insulin lispro",4,"units","SC","with meals",["08:00","12:00","18:00"],by="Dr. P. Lindqvist")
order("ord-05","pt-02","med","metFORMIN 500 mg by mouth twice daily","metFORMIN",500,"mg","PO","twice daily",["08:00","18:00"],by="Dr. P. Lindqvist")
order("ord-06","pt-02","nursing","Bedside blood sugar check before meals and at bedtime",freq="before meals and at bedtime",times=["07:30","11:30","17:30","21:00"],by="Dr. P. Lindqvist")
order("ord-07","pt-03","lab","Basic metabolic panel (blood salts and kidney check) at 06:00",freq="once",times=["06:00"])
order("ord-08","pt-03","med","furosemide 40 mg into the vein once daily","furosemide",40,"mg","IV","daily",["09:00"])
order("ord-09","pt-03","diet","Renal diet, low potassium")
order("ord-10","pt-04","med","acetaminophen 650 mg by mouth every 6 hours as needed for pain","acetaminophen",650,"mg","PO","every 6 hours as needed",None,True,by="Dr. R. Castellano")
order("ord-11","pt-04","med","ceFAZolin 1 g into the vein every 8 hours","ceFAZolin",1,"g","IV","every 8 hours",["06:00","14:00","22:00"],by="Dr. R. Castellano")
order("ord-12","pt-05","med","heparin infusion, 25,000 units in 250 mL, start at 1,000 units/hour, adjust per protocol","heparin",1000,"units/h","IV","continuous infusion",None,by="Dr. P. Lindqvist")
order("ord-13","pt-05","lab","aPTT (blood clotting time) every 6 hours while on heparin",freq="every 6 hours",times=["06:00","12:00","18:00","00:00"],by="Dr. P. Lindqvist")
order("ord-14","pt-05","nursing","Turn patient every 2 hours; fall precautions",freq="every 2 hours",by="Dr. P. Lindqvist")
order("ord-15","pt-06","med","levothyroxine 75 mcg by mouth once daily before breakfast","levothyroxine",75,"mcg","PO","daily",["06:30"],by="Dr. R. Castellano")
order("ord-16","pt-06","med","ondansetron 4 mg into the vein every 8 hours as needed for nausea","ondansetron",4,"mg","IV","every 8 hours as needed",None,True,by="Dr. R. Castellano")
order("ord-17","pt-07","iv","sodium chloride 0.9% into the vein at 100 mL/hour","sodium chloride 0.9%",100,"mL/h","IV","continuous infusion")
order("ord-18","pt-07","med","HYDROmorphone 0.5 mg into the vein every 3 hours as needed for severe pain","HYDROmorphone",0.5,"mg","IV","every 3 hours as needed",None,True)
order("ord-19","pt-07","diet","Nothing by mouth (NPO) for surgery")
order("ord-20","pt-08","med","furosemide 20 mg by mouth once daily","furosemide",20,"mg","PO","daily",["09:00"],by="Dr. P. Lindqvist")
order("ord-21","pt-08","med","potassium chloride 20 mmol by mouth once daily","potassium chloride",20,"mmol","PO","daily",["09:00"],by="Dr. P. Lindqvist")
order("ord-22","pt-08","nursing","Strict intake and output; daily weight",freq="every shift",by="Dr. P. Lindqvist")
order("ord-23","pt-09","med","azithromycin 500 mg into the vein once daily","azithromycin",500,"mg","IV","daily",["10:00"],by="Dr. R. Castellano")
order("ord-24","pt-09","nursing","Oxygen by nasal tube to keep oxygen level at 92% or above",by="Dr. R. Castellano")
order("ord-25","pt-10","med","pantoprazole 40 mg into the vein once daily","pantoprazole",40,"mg","IV","daily",["08:00"])
order("ord-26","pt-10","imaging","Ultrasound of the abdomen (belly scan)")
order("ord-27","pt-10","lab","Complete blood count at 06:00",freq="once",times=["06:00"])
def res(pt, kind, code, name, val, unit, lo, hi, when, text=None):
    flag = None
    if val is not None and lo is not None: flag = "low" if val<lo else "high" if val>hi else "normal"
    db["snapshot_result"].append(dict(id="sr-%03d"%(len(db["snapshot_result"])+1),patient_id=pt,kind=kind,code=code,name=name,value_num=val,value_text=text,unit=unit,range_low=lo,range_high=hi,abnormal_flag=flag,time=when))
base = {"pt-01":(36.8,78,16,138,84,97),"pt-02":(36.9,84,18,126,78,98),"pt-03":(36.6,72,18,148,90,95),"pt-04":(37.4,88,16,118,72,99),"pt-05":(36.5,68,18,112,64,94),
        "pt-06":(37.0,76,16,122,76,98),"pt-07":(37.2,96,20,132,82,97),"pt-08":(36.7,82,20,144,86,93),"pt-09":(38.1,102,22,116,70,91),"pt-10":(37.0,80,16,110,68,99)}
for pt,(tc,hr,rr,sy,di,sp) in base.items():
    w = t(0,5)
    res(pt,"vital","8310-5","Body temperature",tc,"Cel",36.1,37.8,w); res(pt,"vital","8867-4","Heart rate",hr,"/min",60,100,w)
    res(pt,"vital","8480-6","Systolic blood pressure",sy,"mm[Hg]",90,140,w); res(pt,"vital","8462-4","Diastolic blood pressure",di,"mm[Hg]",60,90,w)
    res(pt,"vital","59408-5","Oxygen saturation",sp,"%",92,100,w)
for pt,code,name,val,unit,lo,hi in [("pt-03","2823-3","Potassium",5.4,"mmol/L",3.5,5.1),("pt-03","2160-0","Creatinine",2.1,"mg/dL",0.6,1.3),("pt-02","41653-7","Bedside glucose",212,"mg/dL",70,180),
    ("pt-05","14979-9","aPTT (clotting time)",62,"s",25,35),("pt-08","2823-3","Potassium",3.4,"mmol/L",3.5,5.1),("pt-09","6690-2","White blood cells",14.2,"10*3/uL",4.0,11.0),
    ("pt-10","718-7","Hemoglobin",11.8,"g/dL",12.0,16.0),("pt-07","2951-2","Sodium",139,"mmol/L",135,145),("pt-01","2160-0","Creatinine",1.0,"mg/dL",0.6,1.3)]:
    res(pt,"lab",code,name,val,unit,lo,hi,t(18,30,day=13))
res("pt-08","io","9262-7","Total output in 24 hours",1850,"mL",None,None,t(0,0)); res("pt-08","io","8985-4","Total intake in 24 hours",1420,"mL",None,None,t(0,0))
db["snapshot"].append(dict(id="snap-2026-11-14-0300",taken_at=t(3,0),source_system="Hospital EHR downtime report (fictional)",unit=UNIT,
    row_counts=dict(patient=len(db["patient"]),encounter=len(db["encounter"]),allergy=len(db["allergy"]),active_order=len(db["active_order"]),snapshot_result=len(db["snapshot_result"]))))
# ---------- C. capture
counters = {"dev-01":0,"dev-02":0}; audit=[]
def log(time, user, dev, action, entity, after, before=None):
    audit.append((time,user,dev,action,entity,before,after))
def entry(eid, typ, pt, care, by, dev="dev-01", kind="typed", proposal=None, src=None, confirmed=None, status="confirmed", sched=None, enterer=None, supersedes=None, photo=None, lag=6):
    counters[dev]+=1
    et = shift(care, lag + (17 if dev=="dev-02" else 0))   # dev-02 clock runs 17 min fast
    ext = "jpg" if kind=="photo" else "txt"
    row = dict(id=eid,type=typ,patient_id=pt,encounter_id="enc-"+pt[3:],care_time=care,entry_time=et,scheduled_time=sched,counter=counters[dev],device_id=dev,
        performer_id=by,enterer_id=enterer,raw_input_kind=kind,raw_input_ref="vault/raw/%s.%s"%(eid,ext),ai_proposal=proposal,inference_source=src,confirmed=confirmed,
        confirmed_by=(by if status!="draft" else None),confirmed_at=(shift(et,1) if status!="draft" else None),status=status,supersedes_id=supersedes,photo_check=photo)
    db["entry"].append(row)
    log(et, enterer or by, dev, "entry_saved_raw", "entry/"+eid, "raw")
    if photo: log(et, by, dev, "photo_check", "entry/"+eid, json.dumps(photo))
    if proposal is not None: log(et, by, dev, "ai_proposal_on_device", "entry/"+eid, json.dumps(proposal,sort_keys=True))
    if status!="draft": log(shift(et,1), by, dev, "entry_confirmed", "entry/"+eid, json.dumps(confirmed,sort_keys=True), json.dumps(proposal,sort_keys=True) if proposal else None)
    return row
OKP = lambda form: dict(form_type=form,readable=True,problem="none",overridden=False)
def vit(eid, pt, care, by, v, dev="dev-01", kind="photo", status="confirmed", proposal=None, supersedes=None, photo="auto"):
    keys = ["temp_c","heart_rate","resp_rate","bp_systolic","bp_diastolic","spo2","o2_device","o2_flow_lpm","pain_0_10","glucose_mgdl","consciousness","weight_kg"]
    full = {k: v.get(k) for k in keys}
    conf = {k:x for k,x in full.items() if x is not None}
    prop = proposal if proposal is not None else (dict(conf, unclear=[]) if kind=="photo" else None)
    entry(eid,"vital_sign",pt,care,by,dev,kind,prop,"on_device" if prop is not None else None,conf if status!="draft" else None,status,supersedes=supersedes,photo=(OKP("vitals") if (kind=="photo" and photo=="auto") else (photo if photo!="auto" else None)))
    db["vital_sign"].append(dict(id="vs-"+eid[2:],entry_id=eid,**full,raw_text=v.get("raw_text")))
def med(eid, pt, care, by, oid, event, given=None, dev="dev-01", kind="typed", status="confirmed", proposal=None, reason=None, dc_by=None, site=None, sched=None, route="order", rate=None, rate_unit=None, prior=None, supersedes=None, photo=None, raw=None):
    o = O[oid]; r = o["route"] if route=="order" else route
    conf = dict(drug_name=o["drug_name"],event=event,dose_given=given,dose_given_unit=(o["dose_unit"] if given is not None else None),route=r)
    if rate is not None: conf.update(infusion_rate=rate,infusion_rate_unit=rate_unit)
    prop = proposal if proposal is not None else (dict(conf,unclear=[]) if kind=="photo" else None)
    entry(eid,"med_admin",pt,care,by,dev,kind,prop,"on_device" if prop is not None else None,conf if status!="draft" else None,status,sched=sched,supersedes=supersedes,photo=photo or (OKP("medication") if kind=="photo" else None))
    infusion = rate is not None
    db["med_admin"].append(dict(id="ma-"+eid[2:],entry_id=eid,order_id=oid,drug_name=o["drug_name"],rxnorm_code=None,event=event,dose_due=(None if infusion else o["dose"]),dose_due_unit=(None if infusion else o["dose_unit"]),
        dose_given=given,dose_given_unit=(o["dose_unit"] if given is not None else None),route=r,route_snomed=ROUTE.get(r),site=site,end_time=None,infusion_rate=rate,infusion_rate_unit=rate_unit,prior_infusion_rate=prior,
        reason=reason,double_checked=(True if dc_by else None),double_checked_by=dc_by,raw_text=raw))
def io(eid, pt, care, by, direction, cat, ml, method=None, start=None, end=None, oid=None, kind="typed"):
    conf = dict(direction=direction,category=cat,volume_ml=ml)
    entry(eid,"intake_output",pt,care,by,"dev-01",kind,dict(conf,unclear=[]) if kind=="photo" else None,"on_device" if kind=="photo" else None,conf,photo=OKP("intake_output") if kind=="photo" else None)
    db["intake_output"].append(dict(id="io-"+eid[2:],entry_id=eid,direction=direction,category=cat,volume_ml=ml,method=method,start_time=start,end_time=end,rate=None,rate_unit=None,order_id=oid))
def note(eid, pt, care, by, cat, text, score=None, val=None):
    entry(eid,"note",pt,care,by,"dev-01","typed",None,None,dict(category=cat,text=text))
    db["note"].append(dict(id="nt-"+eid[2:],entry_id=eid,category=cat,text=text,score_name=score,score_value=val))
def lab(eid, pt, care, by, oid, test, status, val=None, unit=None, called=None, rb=None, spec=None, resT=None, src="Blood, vein"):
    entry(eid,"lab_event",pt,care,by,"dev-01","typed",None,None,dict(test_name=test,status=status,value_num=val,unit=unit))
    db["lab_event"].append(dict(id="lb-"+eid[2:],entry_id=eid,order_id=oid,test_name=test,status=status,value_num=val,value_text=None,unit=unit,order_time=O[oid]["start"] if oid else None,specimen_time=spec,specimen_source=src,result_time=resT,called_to=called,read_back=rb))
NP,NA,DO_,SW,AR = "pr-park","pr-alvarez","pr-okafor","pr-whitfield","pr-reyes"
# night shift (03:40-07:00): Park + Alvarez. day shift (07:00 on): Okafor + Whitfield, Reyes (RN) as charge nurse.
# Every high-alert second check in this fictional data is done by an RN, matching the prototype RN-only setting.
vit("e-001","pt-01",t(4,0),NP,dict(temp_c=36.7,heart_rate=76,resp_rate=16,bp_systolic=136,bp_diastolic=82,spo2=97,pain_0_10=0,consciousness="Alert"))
vit("e-002","pt-02",t(4,5),NP,dict(temp_c=36.9,heart_rate=86,resp_rate=18,bp_systolic=128,bp_diastolic=80,spo2=98,pain_0_10=2,consciousness="Alert"))
vit("e-003","pt-03",t(4,10),NA,dict(temp_c=36.6,heart_rate=58,resp_rate=18,bp_systolic=150,bp_diastolic=92,spo2=95,pain_0_10=0,consciousness="Alert"),kind="typed")
vit("e-004","pt-05",t(4,15),NA,dict(temp_c=36.4,heart_rate=70,resp_rate=18,bp_systolic=110,bp_diastolic=62,spo2=94,o2_device="Nasal tube",o2_flow_lpm=2,pain_0_10=3,consciousness="Drowsy but wakes to voice"))
vit("e-005","pt-09",t(4,20),NP,dict(temp_c=38.4,heart_rate=106,resp_rate=24,bp_systolic=114,bp_diastolic=68,spo2=90,o2_device="Nasal tube",o2_flow_lpm=2,pain_0_10=4,consciousness="Alert"))
note("e-006","pt-09",t(4,25),NP,"communication","Oxygen level 90% on 2 L/min. Dr. Castellano told in person at 04:24. New instruction: raise oxygen to 4 L/min and recheck in 30 minutes.")
vit("e-007","pt-09",t(4,55),NP,dict(heart_rate=100,resp_rate=22,spo2=94,o2_device="Nasal tube",o2_flow_lpm=4),kind="typed")
med("e-008","pt-07",t(4,30),NA,"ord-18","administered",0.5,dev="dev-02",dc_by=NP,site="Left forearm IV line",raw="HYDROmorphone 0.5 mg IV given for pain 8/10")
io("e-009","pt-07",t(5,0),NA,"in","iv",400,method="Pump reading",start=t(1,0),end=t(5,0),oid="ord-17")
io("e-010","pt-08",t(5,10),NP,"out","urine",350,method="Measured",kind="photo")
med("e-011","pt-04",t(5,40),NP,"ord-10","administered",650,dev="dev-01",raw="acetaminophen 650 mg PO for pain 5/10")
med("e-012","pt-05",t(5,50),NA,"ord-12","rate_changed",None,dev="dev-02",rate=1150,rate_unit="units/h",prior=1000,dc_by=NP,reason="Per heparin protocol (last clotting time 62 s)",raw="heparin rate 1000 -> 1150 units/h")
lab("e-013","pt-03",t(6,5),NA,"ord-07","Basic metabolic panel","collected",spec=t(6,5))
lab("e-014","pt-05",t(6,10),NA,"ord-13","aPTT (clotting time)","collected",spec=t(6,10))
lab("e-015","pt-10",t(6,15),NP,"ord-27","Complete blood count","collected",spec=t(6,15))
med("e-016","pt-04",t(6,0),NP,"ord-11","administered",1,kind="photo",site="Right hand IV line",sched=t(6,0))
med("e-017","pt-06",t(6,30),NA,"ord-15","administered",75,kind="photo",sched=t(6,30))
# duplicate dose across shift change: Bell got acetaminophen at 05:40 (dev-01); day nurse gives again 07:25 on dev-02 (less than 6 h apart)
med("e-018","pt-04",t(7,25),SW,"ord-10","administered",650,raw="acetaminophen 650 mg PO for pain 6/10")
note("e-019","pt-05",t(7,10),DO_,"risk_score","Skin check done. Heels red but skin not broken. Turning every 2 hours continued.",score="Braden (pressure-sore risk, 6-23, lower is worse)",val=13)
note("e-020","pt-05",t(7,12),DO_,"risk_score","High fall risk. Bed alarm on, call bell in reach.",score="Morse Fall Scale (0-125, higher is worse)",val=65)
vit("e-021","pt-02",t(7,30),SW,dict(glucose_mgdl=248),kind="typed")
med("e-022","pt-02",t(8,0),DO_,"ord-04","administered",4,dc_by=AR,site="Abdomen, left side",sched=t(8,0),raw="insulin lispro 4 units SC with breakfast; blood sugar 248")
med("e-023","pt-02",t(8,2),DO_,"ord-05","administered",500,sched=t(8,0))
vit("e-024","pt-01",t(8,0),DO_,dict(temp_c=36.8,heart_rate=74,resp_rate=16,bp_systolic=134,bp_diastolic=80,spo2=97,pain_0_10=0,consciousness="Alert"))
vit("e-025","pt-03",t(8,5),SW,dict(temp_c=36.7,heart_rate=54,resp_rate=18,bp_systolic=152,bp_diastolic=94,spo2=95,pain_0_10=0,consciousness="Alert"))
# critical potassium phoned from the lab at 08:20, doctor told late (08:55)
lab("e-026","pt-03",t(8,20),DO_,"ord-07","Potassium","critical",val=6.2,unit="mmol/L",called="Dr. A. Whitaker, told by phone at 08:55",rb=True,spec=t(6,5),resT=t(8,20))
note("e-027","pt-03",t(8,58),DO_,"communication","Critical potassium 6.2 mmol/L phoned from the lab at 08:20. Dr. Whitaker reached at 08:55 (35 minutes later, was in a procedure). Read-back done. Heart tracing ordered.")
med("e-028","pt-10",t(8,10),SW,"ord-25","administered",40,sched=t(8,0),site="Left forearm IV line")
# the 50 vs 5 case: paper says "5.0 mg"; on-device AI read 50; nurse confirmed 50 in a hurry
med("e-029","pt-01",t(9,0),DO_,"ord-01","administered",50,dev="dev-01",kind="photo",sched=t(9,0),proposal=dict(drug_name="amLODIPine",event="administered",dose_given=50,dose_given_unit="mg",route="PO",unclear=["dose_given"]),raw="Paper sheet line: amlodipine 5.0 mg PO 0900 DO")
med("e-030","pt-01",t(9,2),DO_,"ord-02","administered",25,dev="dev-01",kind="photo",sched=t(9,0))
med("e-031","pt-03",t(9,5),SW,"ord-08","held",None,sched=t(9,0),reason="Held: heart rate 54 and critical potassium. Dr. Whitaker aware.")
# missing field: route left empty
med("e-032","pt-08",t(9,10),SW,"ord-20","administered",20,sched=t(9,0),route=None)
med("e-033","pt-08",t(9,12),SW,"ord-21","refused",None,sched=t(9,0),reason="Patient refused: says the tablet upsets her stomach. Dr. Lindqvist told.")
io("e-034","pt-08",t(9,30),SW,"in","oral",240,method="Measured")
io("e-035","pt-08",t(10,15),SW,"out","urine",420,method="Measured")
med("e-036","pt-09",t(10,0),DO_,"ord-23","administered",500,sched=t(10,0),site="Right forearm IV line")
io("e-037","pt-07",t(9,0),DO_,"in","iv",400,method="Pump reading",start=t(5,0),end=t(9,0),oid="ord-17")
io("e-038","pt-06",t(9,45),SW,"out","emesis",150,method="Estimated")
med("e-039","pt-06",t(9,50),SW,"ord-16","administered",4,site="Left hand IV line",raw="ondansetron 4 mg IV for nausea")
# correction chain: vitals typed wrong (heart rate 18), then corrected
vit("e-040","pt-06",t(10,0),SW,dict(temp_c=37.1,heart_rate=18,resp_rate=78,bp_systolic=124,bp_diastolic=78,spo2=98,pain_0_10=1,consciousness="Alert"),kind="typed",status="corrected")
vit("e-041","pt-06",t(10,0),SW,dict(temp_c=37.1,heart_rate=78,resp_rate=18,bp_systolic=124,bp_diastolic=78,spo2=98,pain_0_10=1,consciousness="Alert"),kind="typed",supersedes="e-040")
# entered on the wrong patient, then marked entered-in-error
vit("e-042","pt-10",t(10,20),DO_,dict(glucose_mgdl=231),kind="typed",status="entered-in-error")
vit("e-043","pt-02",t(11,30),DO_,dict(glucose_mgdl=196),kind="typed")
# blurry photo, nurse chose "use anyway"
vit("e-044","pt-04",t(11,0),SW,dict(temp_c=37.6,heart_rate=90,resp_rate=16,bp_systolic=116,bp_diastolic=70,spo2=99,pain_0_10=3,consciousness="Alert"),photo=dict(form_type="vitals",readable=False,problem="blurry",overridden=True),
    proposal=dict(temp_c=37.6,heart_rate=90,resp_rate=16,bp_systolic=116,bp_diastolic=70,spo2=99,pain_0_10=3,consciousness="Alert",unclear=["bp_diastolic","temp_c"]))
med("e-045","pt-02",t(12,0),DO_,"ord-04","administered",4,dc_by=AR,site="Abdomen, right side",sched=t(12,0),raw="insulin lispro 4 units SC with lunch; blood sugar 196")
vit("e-046","pt-05",t(12,0),DO_,dict(temp_c=36.6,heart_rate=72,resp_rate=18,bp_systolic=114,bp_diastolic=66,spo2=95,o2_device="Nasal tube",o2_flow_lpm=2,pain_0_10=2,consciousness="Alert"))
lab("e-047","pt-05",t(12,5),DO_,"ord-13","aPTT (clotting time)","pending",spec=None)
# drafts still waiting for the nurse (shown as dashed "AI proposal" cards)
vit("e-048","pt-08",t(12,10),SW,dict(temp_c=36.8,heart_rate=84,resp_rate=20,bp_systolic=146,bp_diastolic=88,spo2=93,pain_0_10=0,consciousness="Alert"),status="draft")
med("e-049","pt-07",t(12,20),DO_,"ord-18","administered",0.5,kind="photo",status="draft",dev="dev-01",site="Left forearm IV line")
db["downtime_event"][0]["note"] = "Night shift 19:00-07:00, day shift 07:00-19:00. Outage ran 03:40-12:40 (9 hours) across the 07:00 shift change."
# ---------- D. recovery
log(t(3,40),"pr-ellis","dev-01","downtime_declared","downtime_event/dt-2026-11-14","declared")
log(t(12,40),"pr-ellis","dev-01","network_cleared","downtime_event/dt-2026-11-14","cleared")
CAT = {"med_admin":("meds",90),"lab_event":("results",70),"vital_sign":("vitals",50),"intake_output":("io",40),"note":("notes",30)}
flags = {"e-018":["duplicate"],"e-011":["duplicate"],"e-029":["recheck"],"e-032":["missing_field"],"e-012":["time_conflict"],"e-008":["time_conflict"],"e-026":[]}
second = {"e-029":("mismatch",dict(drug_name="amLODIPine",event="administered",dose_given=5,dose_given_unit="mg",route="PO"),["dose_given"]),
          "e-044":("mismatch",dict(temp_c=37.6,heart_rate=90,resp_rate=16,bp_systolic=116,bp_diastolic=76,spo2=99,pain_0_10=3),["bp_diastolic"]),
          "e-030":("not_available",None,None)}
signed = {"e-001":(DO_,t(13,5)),"e-002":(DO_,t(13,6)),"e-003":(DO_,t(13,8)),"e-004":(DO_,t(13,9)),"e-016":(SW,t(13,2)),"e-017":(SW,t(13,3)),"e-022":(DO_,t(12,55)),"e-023":(DO_,t(12,56)),"e-045":(DO_,t(12,57)),"e-036":(SW,t(13,12)),"e-028":(SW,t(13,14))}
exported = {"e-016","e-017","e-022","e-023","e-045"}
n=0
for e in db["entry"]:
    if e["status"] in ("draft","corrected","entered-in-error"): continue
    n+=1; cat,pri = CAT[e["type"]]; f = flags.get(e["id"],[])
    if e["id"]=="e-044": f = ["recheck"]
    pri += 8*len(f) + (10 if e["id"]=="e-026" else 0)
    sl = second.get(e["id"]) or (("match",e["confirmed"],[]) if e["raw_input_kind"]=="photo" else (None,None,None))
    so = signed.get(e["id"])
    db["worklist_item"].append(dict(id="wl-%03d"%n,entry_id=e["id"],patient_id=e["patient_id"],category=cat,priority=min(pri,100),flags=f,billable=None,
        assigned_to=(so[0] if so else (DO_ if cat in("meds","results") else SW)),signed_off_by=(so[0] if so else None),signed_off_at=(so[1] if so else None),
        exported_at=(t(13,20) if e["id"] in exported else None),second_look_status=sl[0],second_look_reading=sl[1],mismatch_fields=sl[2]))
    if sl[0]: log(t(12,46),"pr-ellis","dev-01","second_look_"+sl[0],"entry/"+e["id"],json.dumps(sl[1],sort_keys=True) if sl[1] else "none")
    if so: log(so[1],so[0],"dev-01","worklist_signed_off","entry/"+e["id"],"signed")
log(t(13,20),"pr-ellis","dev-01","fhir_export","downtime_event/dt-2026-11-14","5 entries exported")
db["worklist_item"].sort(key=lambda r:(-r["priority"],r["id"]))
db["handoff"] += [
 dict(id="ho-01",patient_id="pt-09",shift="Night to day, 14 Nov 07:00",situation="Peter Novak, 62, chest infection. Oxygen level dropped to 90% at 04:20.",background="Admitted 13 Nov. Droplet isolation. On azithromycin into the vein once daily.",assessment="Oxygen raised from 2 to 4 L/min at 04:25; level 94% at 04:55. Temperature 38.4 C.",open_items=["Azithromycin due 10:00","Recheck oxygen level and temperature at 08:00"],source_entry_ids=["e-005","e-006","e-007"],created_by=NP),
 dict(id="ho-02",patient_id="pt-05",shift="Night to day, 14 Nov 07:00",situation="Tom Hale, 82, on a heparin infusion (blood thinner).",background="DNR. Contact isolation. Allergic to codeine and shellfish.",assessment="Heparin rate raised from 1,000 to 1,150 units/hour at 05:50 per protocol, double-checked. Clotting-time blood sample taken 06:10, result not back.",open_items=["Chase the 06:10 clotting-time result","Next clotting-time sample due 12:00","Turn every 2 hours"],source_entry_ids=["e-004","e-012","e-014"],created_by=NA),
 dict(id="ho-03",patient_id="pt-04",shift="Night to day, 14 Nov 07:00",situation="Grace Bell, 39, day 1 after surgery, pain 5/10 overnight.",background="Latex allergy. On ceFAZolin into the vein every 8 hours.",assessment="Acetaminophen 650 mg given at 05:40 for pain. ceFAZolin 1 g given at 06:00.",open_items=["Next acetaminophen not before 11:40","ceFAZolin due 14:00"],source_entry_ids=["e-011","e-016"],created_by=NP)]
audit.sort(key=lambda a:a[0])
prev = "0"*64
for i,(time,user,dev,action,entity,before,after) in enumerate(audit):
    h = lambda s: hashlib.sha256(s.encode()).hexdigest() if s is not None else None
    row = dict(id="au-%04d"%(i+1),seq=i+1,time=time,user_id=user,device_id=dev,action=action,entity=entity,before_hash=h(before),after_hash=h(after),prev_row_hash=prev)
    prev = hashlib.sha256(json.dumps(row,sort_keys=True).encode()).hexdigest(); db["audit_log"].append(row)
db["key_store"].append(dict(id="ks-01",wrapped_key_pin="FAKE-WRAPPED-KEY-PIN-not-a-real-key",wrapped_key_recovery="FAKE-WRAPPED-KEY-RECOVERY-not-a-real-key",created_at=t(9,0,day=2),rotated_at=None))
# ---------- checks
ids = {tbl:{r["id"] for r in rows} for tbl,rows in db.items()}
for tbl,rows in db.items(): assert len(ids[tbl])==len(rows), tbl
fk = {"patient_id":"patient","encounter_id":"encounter","entry_id":"entry","order_id":"active_order","device_id":"device","performer_id":"practitioner","enterer_id":"practitioner","confirmed_by":"practitioner","supersedes_id":"entry",
      "user_id":"practitioner","declared_by":"practitioner","cleared_by":"practitioner","assigned_to":"practitioner","signed_off_by":"practitioner","double_checked_by":"practitioner","created_by":"practitioner"}
for tbl,rows in db.items():
    for r in rows:
        for k,target in fk.items():
            if r.get(k) is not None: assert r[k] in ids[target], (tbl,r["id"],k,r[k])
for h in db["handoff"]:
    for e in h["source_entry_ids"]:
        assert e in ids["entry"] and next(x for x in db["entry"] if x["id"]==e)["status"]=="confirmed"
child = {"vital_sign","med_admin","intake_output","note","lab_event"}
assert sum(len(db[c]) for c in child)==len(db["entry"])
out = dict(_meta=dict(name="DowntimeKit seed data",warning="100% FAKE (synthetic) data. No real patients, staff, hospitals or keys.",hospital="Riverside General Hospital (fictional)",unit=UNIT,timezone="UTC-05:00",
    second_check="Every high-alert second check in this fictional data is done by an RN. Who may be a second checker is a hospital policy that needs approval; the app uses an RN-only prototype setting.",
    scenario="EHR outage 14 Nov 2026, 03:40 to 12:40 (9 hours), across the 07:00 shift change. Recovery in progress at 13:20.",schema="Data & Database Plan, section 8 (19 tables)",
    extra_fields="route_snomed on active_order and med_admin (SNOMED CT route code); note on downtime_event; med_admin.event also uses rate_changed for an infusion rate change; inference_source values are on_device or in_cloud",drill_sign_in="pin_hash values are placeholders. In Drill mode the app re-creates every seed PIN as 2468 on first load.",row_counts={k:len(v) for k,v in db.items()}),**db)
json.dump(out,open("downtimekit-seed.json","w"),indent=1)
print(json.dumps(out["_meta"]["row_counts"]), sum(out["_meta"]["row_counts"].values()))
from collections import Counter
print(Counter(e["status"] for e in db["entry"]), Counter(e["raw_input_kind"] for e in db["entry"]))
print(Counter(tuple(w["flags"]) for w in db["worklist_item"]), Counter(w["second_look_status"] for w in db["worklist_item"]), sum(1 for w in db["worklist_item"] if w["signed_off_by"]))
print(Counter(a["action"] for a in db["audit_log"]))
