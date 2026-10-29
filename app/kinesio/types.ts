// Shared contract between the rig pipeline (scripts/kinesio), the clinical catalog and the viewer.
export type Side = 'l'|'r';
export type JointId = 'pelvis'|`hip_${Side}`|`knee_${Side}`|`ankle_${Side}`;
// Positive values: hip flexion, abduction and internal rotation; knee flexion; ankle dorsiflexion. Degrees.
export type Motion = 'flexion'|'abduction'|'rotation';
export type JointAngles = Partial<Record<JointId,Partial<Record<Motion,number>>>>;
export type MuscleId = 'biceps_femoris_long'|'biceps_femoris_short'|'semitendinosus'|'semimembranosus'|'rectus_femoris'|'vastus_lateralis'|'vastus_medialis'|'vastus_intermedius'|'psoas_major'|'iliacus'|'gastrocnemius_medial'|'gastrocnemius_lateral'|'soleus'|'adductor_longus'|'adductor_brevis'|'adductor_magnus'|'gracilis'|'pectineus';
export type PatientPosition = 'supino'|'prono'|'lateral'|'sedente'|'bipedestacion';
export interface Citation {source:string;section:string}
export interface StretchVariant {
 position:PatientPosition;
 // 'activo': the patient moves; 'pasivo': the therapist moves the segment; 'inmovil': the patient cannot change position (decúbito obligado).
 mode:'activo'|'pasivo'|'inmovil';
 setup:string;action:string;fixation:string;
 pose:JointAngles;
 note?:string;
}
export interface StretchEntry {
 id:string;group:string;title:string;muscles:MuscleId[];
 side:Side;
 test?:string;normal?:string;
 variants:StretchVariant[];
 precautions:string[];
 citations:Citation[];
 validated:false;
}
// Metadata written by scripts/kinesio/build-rig.py next to the glb. Node names are the raw glTF names; three.js
// GLTFLoader sanitizes them on load (PropertyBinding.sanitizeNodeName), so look them up sanitized. Axes are unit vectors in the glTF world
// frame of the rest pose (Y up, body facing +Z); a positive angle about the axis is the positive motion.
// A muscle's length is measured along origin -> via points -> insertion; restLength is that path at rest.
export interface RigJoint {id:JointId;bone:string;pivot:[number,number,number];axes:Partial<Record<Motion,[number,number,number]>>;limits:Partial<Record<Motion,[number,number]>>}
export interface RigMuscle {id:MuscleId;side:Side;name:string;mesh:string;bones:string[];origin:string;insertion:string;via:string[];restLength:number;fallback:('origin'|'insertion')[]}
export interface RigMeta {model:string;modelBytes:number;license:string;joints:RigJoint[];muscles:RigMuscle[];context:string[];bounds:{min:[number,number,number];max:[number,number,number]}}
