datablock ForceFieldBareData(powdaTeamFieldBlue)
{
   fadeMS           = 1000;
   baseTranslucency = 0.9;
   powerOffTranslucency = 0.0;
   teamPermiable    = true;
   otherPermiable   = true;
   // it's RGB (red green blue)
   color            = "0.0 0.0 0.01";
   powerOffColor    = "0.0 0.0 0.0";
   targetTypeTag    = 'ForceField';

   texture[0] = "skins/Scout_winshield.png";

   framesPerSec = 0;
   numFrames = 1;
   scrollSpeed = 0;
   umapping = 1.0;
   vmapping = 0.15;
};

function powdaTeamFieldBlue::onAdd(%data, %obj){
   parent::onAdd(%data,%obj);
   if(%obj.pz.getClassName() $= "PhysicalZone"){
      %obj.pz.delete(); 
   }
}