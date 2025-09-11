
function GameBaseData::onAdd(%data, %obj)
{
   if(%data.targetTypeTag !$= "")
   {
      // use the name given to the object in the mission file
      if(%obj.nameTag !$= "")
      {
         %obj.nameTag = addTaggedString(%obj.nameTag);
         %nameTag = %obj.nameTag;
      }
      else
         %nameTag = %data.targetNameTag;

   	%obj.target = createTarget(%obj, %nameTag, "", "", %data.targetTypeTag, 0, 0);
   }
   else
      %obj.target = -1;
}

function GameBaseData::onRemove(%data, %obj)
{
   %target = %obj.getTarget();

   // first 32 targets are team targets
   if(%target >= 32)
   {
      if(%obj.nameTag !$= "")
         removeTaggedString(%obj.nameTag);
      freeTarget(%target);
   }
}

function InteriorInstance::damage()
{
}

function TerrainBlock::damage()
{
}

function ForceFieldBare::damage()
{
}

function GameBaseData::shouldApplyImpulse(%data, %obj)
{
   return %data.shouldApplyImpulse;
}


function ShapeBaseData::onAdd(%data, %obj)
{
   Parent::onAdd(%data, %obj);
	// if it's a deployed object, schedule the ambient thread to play in a little while
   if(%data.deployAmbientThread)
	   %obj.schedule(750, "playThread", $AmbientThread, "ambient");
	// check for ambient animation that should always be played
	if(%data.alwaysAmbient)
		%obj.playThread($AmbientThread, "ambient");
}

function SimObject::setOwnerClient(%obj, %cl)
{
   %obj.client = %cl;
}

function SimObject::getOwnerClient(%obj)
{
   if(isObject(%obj))
      return %obj.client;
   return 0;
}
 // recursive objective init functions for mission group

function SimGroup::objectiveInit(%this)
{
   for (%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).objectiveInit();   
}

function SimObject::objectiveInit(%this)
{
}

function GameBase::objectiveInit(%this)
{
	//error("Initializing object " @ %this @ ", " @ %this.getDataBlock().getName());
   %this.getDataBlock().objectiveInit(%this);
}

// tag strings are ignored if they start with an underscore
function GameBase::getGameName(%this)
{
   %name = "";

   if(%this.nameTag !$= "")
      %name = %this.nameTag;
   else
   {
      %name = getTaggedString(%this.getDataBlock().targetNameTag);
      if((%name !$= "") && (getSubStr(%name, 0, 1) $= "_"))
         %name = "";
   }
   
   %type = getTaggedString(%this.getDataBlock().targetTypeTag);
   if((%type !$= "") && (getSubStr(%type, 0, 1) !$= "_"))
   {
      if(%name !$= "")
         return(%name @ " " @ %type);
      else
         return(%type);
   }

   return(%name);   
}
