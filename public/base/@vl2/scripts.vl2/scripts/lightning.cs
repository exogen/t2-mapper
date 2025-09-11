//--------------------------------------------------------------------------
// 
// 
// 
//--------------------------------------------------------------------------

//--------------------------------------------------------------------------
//-------------------------------------- Sounds
//
datablock AudioDescription(ThunderDescription)
{
   volume   = 1.0;
   isLooping= false;
   is3D     = true;
   minDistance= 100.0;
   MaxDistance= 6400.0;
   type     = $EffectAudioType;
};

datablock AudioProfile(thunderCrash1)
{
   filename  = "fx/environment/ctmelody1.wav";
   description = ThunderDescription;
};

datablock AudioProfile(thunderCrash2)
{
   filename  = "fx/environment/ctmelody2.wav";
   description = ThunderDescription;
};

datablock AudioProfile(thunderCrash3)
{
   filename  = "fx/environment/ctmelody3.wav";
   description = ThunderDescription;
};

datablock AudioProfile(thunderCrash4)
{
   filename  = "fx/environment/ctmelody4.wav";
   description = ThunderDescription;
};

datablock AudioProfile(LightningHitSound)
{
   filename = "fx/misc/lightning_impact.wav";
   description = AudioExplosion3d;
};

//--------------------------------------------------------------------------
//-------------------------------------- Default storm...
//
// Note to datablock editors: The lightning will randomly choose from the arrays
//  to build a strike.  There are 8 slots for thunder sounds. Make sure all 8 slots
//  are filled.  If necessary, duplicate the sounds/textures into the extra slots.
//  

datablock LightningData(DefaultStorm)
{
   directDamageType = $DamageType::Lightning;
   directDamage = 0.4;
   
   strikeTextures[0]  = "special/skyLightning";

   strikeSound = LightningHitSound;
   
   thunderSounds[0] = thunderCrash1;
   thunderSounds[1] = thunderCrash2;
   thunderSounds[2] = thunderCrash3;
   thunderSounds[3] = thunderCrash4;
   thunderSounds[4] = thunderCrash1;
   thunderSounds[5] = thunderCrash2;
   thunderSounds[6] = thunderCrash3;
   thunderSounds[7] = thunderCrash4;
};

function LightningData::applyDamage(%data, %lightningObj, %targetObject, %position, %normal)
{
   %targetObject.damage(%lightningObj, %position, %data.directDamage, %data.directDamageType);
}
