// BonusCategories

// You can create CBonuses that arbitrarily combine any number of
// these categories.  Pretty cool.
// Prefixes - tests a player's orientation relative to an object
// Noun - tests two players' heights and one player's speed
// Qualifier - tests an object's horizontal speed, vertical speed, and hangtime
// Description - very specific category for flag passes
//

exec("scripts/TR2Prefixes.cs");
exec("scripts/TR2Nouns.cs");
exec("scripts/TR2Qualifiers.cs");
exec("scripts/TR2Descriptions.cs");
exec("scripts/TR2WeaponBonuses.cs");

function BonusCategory::performEffects(%this, %component, %obj)
{
   // DEBUG!  Don't play dummy sounds
   if (%component.sound $= "blah.wav")
      return;

   serverPlay2d(%component.sound);

   // Particle effects
}

function BonusCategory::createCategoryData(%this, %p0, %p1, %p2, %p3, %p4)
{
  // Add some dynamic info to the data before returning it.  Save the parameter
  // values for calculating variance.
  %categoryData = %this.data.get(%p0, %p1, %p2, %p3, %p4);
  %categoryData.numParameters = %this.dimensionality;
  
  for (%i=0; %i<%categoryData.numParameters; %i++)
     %categoryData.parameter[%i] = %p[%i];

  return %categoryData;
}

// Nouns
new ScriptObject(Noun)
{
  class = Noun;
  superclass = BonusCategory;
  dimensionality = 3;
  passerSpeedLevels = 4;
  grabberSpeedLevels = 4;
  grabberHeightLevels = 4;
  passerSpeedThreshold[0] = 10;
  passerSpeedThreshold[1] = 35;
  passerSpeedThreshold[2] = 57;
  passerSpeedThreshold[3] = 85;
  grabberSpeedThreshold[0] = 10;
  grabberSpeedThreshold[1] = 35;
  grabberSpeedThreshold[2] = 57;
  grabberSpeedThreshold[3] = 85;
  grabberHeightThreshold[0] = 5;
  grabberHeightThreshold[1] = 30;
  grabberHeightThreshold[2] = 90;
  grabberHeightThreshold[3] = 230;
  soundDelay = 0;
};

// Nouns play in 3D
function Noun::performEffects(%this, %component, %obj)
{
   // DEBUG!  Don't play dummy sounds
   if (%component.sound $= "blah.wav")
      return;

   serverPlay2d(%component.sound);//, %obj.getPosition());
}

function Noun::evaluateold(%this, %grabber, %flag)
{
   %passerSpeed = VectorLen(%flag.dropperVelocity);
   %grabberSpeed = %grabber.getSpeed();
   %grabberHeight = %grabber.getHeight();
   
   // Don't award a Noun bonus if the flag is on a goal
   if (%flag.onGoal)
      return;

   // Might be able to abstract these loops somehow
   // Passer speed
   for(%i=%this.passerSpeedLevels - 1; %i>0; %i--)
      if (%passerSpeed >= %this.passerSpeedThreshold[%i])
         break;

   // Grabber speed
   for(%j=%this.grabberSpeedLevels - 1; %j>0; %j--)
      if (%grabberSpeed >= %this.grabberSpeedThreshold[%j])
         break;

   // Grabber height
   for(%k=%this.grabberHeightLevels - 1; %k>0; %k--)
      if (%grabberHeight >= %this.grabberHeightThreshold[%k])
         break;

   //echo("NOUN:  passSpeed = " @ %passerSpeed @ "  grabSpeed = " @ %grabberSpeed @ "  grabHeight = " @ %grabberHeight);
   //echo("NOUN:  " SPC %i SPC %j SPC %k);
   return %this.createCategoryData(%i, %j, %k);
}

function Noun::evaluate(%this, %player1, %player2, %flag)
{
   if (%flag !$= "")
   {
      // Don't award a Noun bonus if the flag is on a goal
      if (%flag.onGoal)
         return %this.createCategoryData(0, 0, 0);

      // If the flag thinks it is airborn, yet it's not moving...
      if (%flag.getHeight() > 7 && %flag.getSpeed() < 3)
         return %this.createCategoryData(0, 0, 0);

      // Use a special Noun for water pickups
      if (%flag.inLiquid)
         return $WaterNoun;

         %player1Speed = VectorLen(%flag.dropperVelocity);
    }
    else
       %player1Speed = %player1.getSpeed();
      
   %player2Speed = %player2.getSpeed();
   %player2Height = %player2.getHeight();

   // Might be able to abstract these loops somehow
   // Passer speed
   for(%i=%this.passerSpeedLevels - 1; %i>0; %i--)
      if (%player1Speed >= %this.passerSpeedThreshold[%i])
         break;

   // Grabber speed
   for(%j=%this.grabberSpeedLevels - 1; %j>0; %j--)
      if (%player2Speed >= %this.grabberSpeedThreshold[%j])
         break;

   // Grabber height
   for(%k=%this.grabberHeightLevels - 1; %k>0; %k--)
      if (%player2Height >= %this.grabberHeightThreshold[%k])
         break;

   //echo("NOUN:  passSpeed = " @ %passerSpeed @ "  grabSpeed = " @ %grabberSpeed @ "  grabHeight = " @ %grabberHeight);
   //echo("NOUN:  " SPC %i SPC %j SPC %k);
   return %this.createCategoryData(%i, %j, %k);
}

// Qualifiers
new ScriptObject(Qualifier)
{
  class = Qualifier;
  superclass = BonusCategory;
  dimensionality = 3;
  horizontalFlagSpeedLevels = 2;
  verticalFlagSpeedLevels = 3;
  hangTimeLevels = 4;
  horizontalFlagSpeedThreshold[0] = 10;
  horizontalFlagSpeedThreshold[1] = 40;
  verticalFlagSpeedThreshold[0] = 4;
  verticalFlagSpeedThreshold[1] = 20;
  verticalFlagSpeedThreshold[2] = 40;
  hangTimeThreshold[0] = 500;
  hangTimeThreshold[1] = 1200;
  hangTimeThreshold[2] = 2500;
  hangTimeThreshold[3] = 5000;
  soundDelay = 0;
};

function Qualifier::evaluate(%this, %dropper, %grabber, %flag)
{
   %flagSpeed = %flag.getSpeed();
   if (%flag.inLiquid || %dropper $= "" || %flag.getSpeed() < 5)
      return;
      
   %dropperSpeed = VectorLen(%flag.dropperVelocity);
   
   // Lock these down a bit
   if (%grabber.getSpeed() < 13 && %dropperSpeed < 8)
      return;
      
   //if (getSimTime() - %flag.dropTime <= 500)
   //   return;
      
   if (%flag.getHeight() < 7)
      return;
      
    %flagVel = %flag.getVelocity();
   %horizontalFlagSpeed = VectorLen(setWord(%flagVel, 2, 0));
   %verticalFlagSpeed = mAbs(getWord(%flagVel, 2));

   // Test to see if the pass was good enough...it must have a sufficient
   // horizontal speed, and failing that, it must either be midair or have
   // a sufficient downward speed.
   if (%horizontalFlagSpeed < %this.horizontalFlagSpeedThreshold[0])
      if (%flag.getHeight() < 10)
        if (%verticalFlagSpeed < %this.verticalFlagSpeedThreshold[0])
           return "";


   // Horizontal flag speed
   for(%i=%this.horizontalFlagSpeedLevels - 1; %i>0; %i--)
      if (%horizontalFlagSpeed >= %this.horizontalFlagSpeedThreshold[%i])
         break;

   // Vertical flag speed
   for(%j=%this.verticalFlagSpeedLevels - 1; %j>0; %j--)
      if (%verticalFlagSpeed >= %this.verticalFlagSpeedThreshold[%j])
         break;

   // Hangtime
   %hangtime = getSimTime() - %flag.dropTime;
   for(%k=%this.hangTimeLevels - 1; %k>0; %k--)
      if (%hangTime >= %this.hangTimeThreshold[%k])
         break;

   //echo("QUALIFIER:  horSpeed = " @ %horizontalFlagSpeed @ "  verSpeed = " @ %verticalFlagSpeed @ "  hang = " @ %hangtime);
   //echo("QUALIFIER:  " @ %i SPC %j SPC %k);

   return %this.createCategoryData(%i, %j, %k);
}

// Descriptions
new ScriptObject(Description)
{
  class = Description;
  superclass = BonusCategory;
  dimensionality = 3;
  soundDelay = 1000;
};

function Description::evaluate(%this, %dropper, %grabber, %flag)
{
   %flagVel = %flag.getVelocity();

   // Return default description if the flag was dropped because the flag
   // carrier died.
   if (%dropper $= "" || %dropper.client.plyrDiedHoldingFlag
       || %flag.inLiquid)
      return $DefaultDescription;
      
   if (%grabber.getHeight() < 5 || %flag.getSpeed() < 5 || %flag.getHeight() < 5)
      return $DefaultDescription;

   // Make sure the pass was good enough to warrant a full bonus description.
   // If it wasn't a high pass with decent speed, check the hangtime; if there
   // wasn't lots of hangtime, don't give this bonus
   if (%flag.getHeight() < 30 || %flag.getSpeed() < 15)
     if (getSimTime() - %flag.dropTime <= 1000)
        return $DefaultDescription;
        
   %dropperSpeed = VectorLen(%flag.dropperVelocity);
   // Don't give this bonus if they're both just standing/hovering around
   if (%grabber.getSpeed() < 17 && %dropperSpeed < 12)
      return $DefaultDescription;


   // Determine passer's dominant direction (horizontal or vertical) at the
   // time the flag was dropped.
   %passerVertical = getWord(%flag.dropperVelocity, 2);
   %passerHorizontal = VectorLen(setWord(%flag.dropperVelocity, 2, 0));
   %passerDir = 0;         // Horizontal dominance
   if ( mAbs(%passerVertical) >= %passerHorizontal)
   {
      // Now decide if the passer was travelling mostly up or mostly down
      if (%passerVertical >= 0)
         %passerDir = 1;   // Upward dominance
      else
         %passerDir = 2;   // Downward dominance
   }

   //echo("DESCRIPTION:  ver = " @ %passerVertical @ "  hor = " @ %passerHorizontal);

   // Based on the dominant direction, use either the xy-plane or the xz-plane
   // for comparisons.
   if (%passerDir == 0)
   {
      // Horizontal:  use xy-plane
      %dropperOrientationN = setWord(VectorNormalize(%flag.dropperOrientation), 2, 0);
      %dropperVelocityN = setWord(VectorNormalize(%flag.dropperVelocity), 2, 0);
   } else {
      // Vertical:  use xz-plane
      %dropperOrientationN = setWord(VectorNormalize(%flag.dropperOrientation), 1, 0);
      %dropperVelocityN = setWord(VectorNormalize(%flag.dropperVelocity), 1, 0);
   }

   // Determine passer's dominant orientation relative to velocity at the time
   // the flag was dropped (forward pass, backward pass, or perpendicular pass).
   %passDirectionDot = VectorDot(%dropperOrientationN, %dropperVelocityN);
   %passDir = 0;     // Forward pass
   //echo("DESCRIPTION:  passDirDot = " @ %passDirectionDot);
   if (%passDirectionDot <= -0.42)
      %passDir = 1;  // Backward pass
   else if (%passDirectionDot >= -0.29 && %passDirectionDot <= 0.29)
      %passDir = 2;  // Perpendicular pass

   // Do the same for the flag's dominant direction.
   %flagVertical = mAbs(getWord(%flagVel, 2));
   %flagHorizontal = VectorLen(setWord(%flagVel, 2, 0));
   %flagDir = (%flagHorizontal >= %flagVertical) ? 0 : 1;
   %grabberVel = %grabber.getVelocity();

   if (%flagDir == 0)
   {
      %flagVelocityN = setWord(VectorNormalize(%flagVel), 2, 0);
      %grabberVelN = setWord(VectorNormalize(%grabberVel), 2, 0);
   }
   else
   {
      %flagVelocityN = setWord(VectorNormalize(%flagVel), 1, 0);
      %grabberVelN = setWord(VectorNormalize(%grabberVel), 1, 0);
   }

   // Determine the flag's velocity relative to the grabber's velocity at the time
   // the flag is grabbed, ie. now (into pass, with pass, perpendicular to pass).
   %flagDirectionDot = VectorDot(%dropperOrientationN, %grabberVelN);
   %flagDir = 0;     // Default to travelling into the pass
   //echo("DESCRIPTION:  flagDirDot = " @ %flagDirectionDot);
   if (%flagDirectionDot >= 0.7)
      %flagDir = 1;  // Travelling with the pass
   else if (%flagDirectionDot >= -0.21 && %flagDirectionDot <= 0.21)
      %flagDir = 2;  // Travelling perpendicular to the pass

   //echo("DESCRIPTION:"
   //   @ "  passerDir = " @ %passerDir
   //   @ "  passDir = " @ %passDir
   //   @ "  flagDir = " @ %flagDir);

   return %this.createCategoryData(%passerDir, %passDir, %flagDir);
}

// Prefixs

new ScriptObject(Prefix)
{
  class = Prefix;
  superclass = BonusCategory;
  dimensionality = 1;
  grabberOrientationLevels = 3;
  grabberOrientationThreshold[0] = -0.1;
  grabberOrientationThreshold[1] = -0.5;
  grabberOrientationThreshold[2] = -0.85;
  soundDelay = 0;
};

function Prefix::evaluate(%this, %dropper, %grabber, %flag)
{
   // Determine if the grabber caught the flag backwards.  Derive a
   // relative position vector and calculate the dot product.
   %flagPos = %flag.getPosition();
   %grabberPos = %grabber.getPosition();
   %grabberEye = %grabber.getEyeVector();

   // If the flag is sliding around near the ground, only expect the grabber to
   // be horizontally backwards...otherwise, he must be backwards in all dimensions.
   if (%flag.getHeight() < 10 && getWord(%flag.getVelocity(), 2) < 17)
     %flagPos = setWord(%flagPos, 2, getWord(%grabberPos, 2));

   %relativePos = VectorNormalize(VectorSub(%flagPos, %grabberPos));
   %relativeDot = VectorDot(%relativePos, %grabberEye);
   //echo("PREFIX TEST:  reldot = " @ %relativeDot);

   // Should probably put this into a loop
   if (%relativeDot <= %this.grabberOrientationThreshold[2])
      %grabberDir = 2;
   else if (%relativeDot <= %this.grabberOrientationThreshold[1])
      %grabberDir = 1;
   else if (%relativeDot <= %this.grabberOrientationThreshold[0])
      %grabberDir = 0;
   else
      return "";

   //echo("Prefix:  " @ %grabberDir);
   return %this.createCategoryData(%grabberDir);
}

// Weapon speed (speed of victim)
new ScriptObject(SpeedBonus)
{
  class = SpeedBonus;
  superclass = BonusCategory;
  dimensionality = 1;
  SpeedLevels = 3;
  SpeedThreshold[0] = 20;
  SpeedThreshold[1] = 65;
  SpeedThreshold[2] = 100;
  soundDelay = 0;
};

function SpeedBonus::evaluate(%this, %notUsed, %victim)
{
   // A little trick to allow evaluation for either parameter
   if (%victim $= "")
      %victim = %notUsed;
      
   %victimSpeed = %victim.getSpeed();
   
   if (%victimSpeed < %this.SpeedThreshold[0])
     return;

   // Victim speed
   for(%i=%this.SpeedLevels - 1; %i>0; %i--)
      if (%victimSpeed >= %this.SpeedThreshold[%i])
         break;

   //echo("SB:  " SPC %i SPC "speed =" SPC %victimSpeed);
   return %this.createCategoryData(%i);
}

// Weapon height (height of victim)
new ScriptObject(HeightBonus)
{
   class = HeightBonus;
   superclass = BonusCategory;
   dimensionality = 1;
   heightLevels = 3;
   HeightThreshold[0] = 15;
   HeightThreshold[1] = 40;
   HeightThreshold[2] = 85;
};


function HeightBonus::evaluate(%this, %notUsed, %victim)
{
   // A little trick to allow evaluation for either parameter
   if (%victim $= "")
      %victim = %notUsed;
      
   %victimHeight = %victim.getHeight();
   
   if (%victimHeight < %this.HeightThreshold[0])
      return;

   // Victim height
   for(%i=%this.HeightLevels - 1; %i>0; %i--)
      if (%victimHeight >= %this.HeightThreshold[%i])
         break;

   //echo("HB:  " SPC %i);
   return %this.createCategoryData(%i);
}

// Weapon type
new ScriptObject(WeaponTypeBonus)
{
   class = WeaponTypeBonus;
   superclass = BonusCategory;
   dimensionality = 1;
};


function WeaponTypeBonus::evaluate(%this, %shooter, %victim, %damageType)
{
   // Determine shooter weapon type here
   switch(%damageType)
   {
      case $DamageType::Disc:  %i = 0;
      case $DamageType::Grenade:  %i = 1;
      case $DamageType::Bullet:  %i = 2;
   }

   //echo("WTB:  " SPC %i);
   return %this.createCategoryData(%i);
}


