// TR2 Bonuses
// This file execs the entire bonus infrastructure, and also contains all the
// evaluate() and award() functions for bonuses.
exec("scripts/TR2BonusSounds.cs");
exec("scripts/TR2BonusCategories.cs");
exec("scripts/TR2OtherBonuses.cs");

$TR2::teamColor[1] = "<color:CCCC00>";  // Gold
$TR2::teamColor[2] = "<color:BBBBBB>";  // Silver

function initializeBonuses()
{
    // Flag bonus
    if (!isObject(FlagBonus))
    {
       new ScriptObject(FlagBonus)
       {
          class = FlagBonus;
          superclass = Bonus;
          history = FlagBonusHistory;
       };
       FlagBonus.addCategory(Prefix, $PrefixList);
       FlagBonus.addCategory(Noun, $NounList);
       FlagBonus.addCategory(Qualifier, $QualifierList);
       FlagBonus.addCategory(Description, $DescriptionList);
       //MissionCleanup.add(FlagBonus);
    }

    // Weapon kill bonus
    if (!isObject(WeaponBonus))
    {
       new ScriptObject(WeaponBonus)
       {
          class = WeaponBonus;
          superclass = Bonus;
          instant = true;
          history = "";
       };
       WeaponBonus.addCategory(HeightBonus, $WeaponHeightBonusList);
       WeaponBonus.addCategory(SpeedBonus, $WeaponSpeedBonusList);
       WeaponBonus.addCategory(WeaponTypeBonus, $WeaponTypeBonusList);
       //MissionCleanup.add(WeaponBonus);
    }
    
    // Go-go Gadget Bonus
    if (!isObject(G4Bonus))
    {
        new ScriptObject(G4Bonus)
        {
           class = G4Bonus;
           superclass = Bonus;
           history = "";
        };
        G4Bonus.addCategory(Noun, $NounList);
       //MissionCleanup.add(G4Bonus);
    }

     // Midair Bonus
    if (!isObject(MidairBonus))
    {
        new ScriptObject(MidairBonus)
        {
           class = MidairBonus;
           superclass = Bonus;
           history = "";
        };
        //MissionCleanup.add(MidairBonus);
    }
    
    // Collision Bonus
    if (!isObject(CollisionBonus))
    {
        new ScriptObject(CollisionBonus)
        {
           class = CollisionBonus;
           superclass = Bonus;
           history = "";
        };
        //MissionCleanup.add(CollisionBonus);
    }
    
    // Creativity Bonus
    if (!isObject(CreativityBonus))
    {
        new ScriptObject(CreativityBonus)
        {
           class = CreativityBonus;
           superclass = Bonus;
           instant = true;
           lastVariance = 0;
           lastVarianceLevel = 0;
           varianceLevels = 4;
           varianceThreshold[0] = 0;
           varianceThreshold[1] = 17;
           varianceThreshold[2] = 34;
           varianceThreshold[3] = 51;
           varianceValue[0] = 0;
           varianceValue[1] = 25;
           varianceValue[2] = 50;
           varianceValue[3] = 75;
           varianceSound[0] = "";
           varianceSound[1] = Creativity1Sound;
           varianceSound[2] = Creativity2Sound;
           varianceSound[3] = Creativity3Sound;
           history = "";
        };
        //MissionCleanup.add(CreativityBonus);
    }
}

function Bonus::addCategory(%this, %newCategory, %data)
{
   if (%this.numCategories $= "")
      %this.numCategories = 0;
      
   // A category can be used in multiple bonuses
   %this.category[%this.numCategories] = %newCategory;
   %this.category[%this.numCategories].data = %data;
   %this.numCategories++;
}

function Bonus::evaluate(%this, %obj1, %obj2, %obj3, %obj4, %obj5)
{
   // This is added to the bonus history and eventually deleted
   %newBonusData = new ScriptObject()
   {
      class = BonusData;
   };
   MissionCleanup.add(%newBonusData);
   %newBonusData.initialize(%this);

   // Construct the bonus by iterating through categories
   for (%i=0; %i<%this.numCategories; %i++)
   {
      %newCategoryData = %this.category[%i].evaluate(%obj1, %obj2, %obj3, %obj4);
      if (%newCategoryData > 0)
      {
         %newBonusData.addCategoryData(%newCategoryData, %i);

          // Perform audiovisual effects
          %delay = %this.category[%i].soundDelay;
          %this.category[%i].schedule(%delay, "performEffects", %newCategoryData, %obj2);
      }
   }

   // Award the bonus
   if (%newBonusData.getValue() != 0)
      %this.award(%newBonusData, %obj1, %obj2, %obj3);
   else
      %newBonusData.delete();

   return true;
}

////////////////////////////////////////////////////////////////////////////////
// BonusData
// This class stores an instance of a dynamically constructed bonus.
function BonusData::initialize(%this, %bonus)
{
   %this.bonus = %bonus;
   %this.time = GetSimTime();

   %this.maxCategoryDatas = %bonus.numCategories;
   for (%i=0; %i < %this.numCategoryDatas; %i++)
      %this.categoryData[%i] = "";
      
   %this.totalValue = 0;
}

function BonusData::addCategoryData(%this, %newCategoryData, %index)
{
  // This little trick allows a BonusData instance to mirror its
  // Bonus type...it allows a BonusData to have empty component
  // slots.  Empty slots are needed so that successive Bonuses "line up"
  // for calculating variance.  There's likely a better way to do this.
  %this.categoryData[%index] = %newCategoryData;
  %this.totalValue += %newCategoryData.value;
}

function BonusData::getString(%this)
{
   %str = %this.categoryData[0].text;

   for (%i=1; %i < %this.maxCategoryDatas; %i++)
      if (%this.categoryData[%i] !$= "")
         %str = %str SPC %this.categoryData[%i].text;

   return %str;
}

function BonusData::getValue(%this)
{
   return %this.totalValue;
}

////////////////////////////////////////////////////////////////////////////////
// Bonus history and variance
new ScriptObject(FlagBonusHistory)
{
   class = FlagBonusHistory;
   superclass = BonusHistory;
   bonusType = FlagBonus;
   numBonuses = 0;
   variance = 0;
};

function BonusHistory::initialize(%this)
{
   for (%i=0; %i<%this.numBonuses; %i++)
      %this.bonus[%i].delete();

   %this.numBonuses = 0;
   %this.variance = 0;
}

function BonusHistory::add(%this, %newBonus)
{
   %this.bonus[%this.numBonuses] = %newBonus;
   %this.numBonuses++;

   // Calculate the new variance
   return %this.calculateIncrementalVariance();
}

 // An incremental way of calculating the creativity within a bonus
// history as new bonuses are added (incremental approach used for efficiency)
function BonusHistory::calculateIncrementalVariance(%this)
{
   if (%this.numBonuses <= 1)
      return 0;

   %i = %this.numBonuses - 1;
   for(%j=0; %j<%this.bonus[%i].maxCategoryDatas; %j++)
   {
      %categoryData = %this.bonus[%i].categoryData[%j];
      // Don't count empty component slots
      if(%categoryData !$= "")
         for(%k=0; %k<%categoryData.numParameters; %k++)
             %this.variance += mAbs(%categoryData.parameter[%k] -
                        %this.bonus[%i-1].categoryData[%j].parameter[%k]);
   }

   return %this.variance;
}


// An instantaneous way of calculating the creativity within a bonus
// history (inefficient and not intended to be used; for informational
// and debugging purposes only)
function BonusHistory::calculateVariance(%this)
{
  if (%this.numBonuses <= 1)
    return 0;

  %this.variance = 0;

  for(%i=1; %i<%this.numBonuses; %i++)
    for(%j=0; %j<%this.bonus[%i].maxCategoryDatas; %j++)
    {
       %categoryData = %this.bonus[%i].categoryData[%j];
      if (%categoryData !$= "")
         for(%k=0; %k<%categoryData.numParameters; %k++)
            %this.variance += abs(%categoryData.parameter[%k] -
                        %this.bonus[%i-1].categoryData[%j].parameter[%k]);
     }

  return %this.variance;
}

function BonusHistory::getVariance(%this)
{
  return %this.variance;
}

function BonusHistory::getRecentRecipient(%this, %index)
{
   if (%index $= "")
      %index = 0;
      
   return %this.bonus[%this.numBonuses-1-%index].recipient;
}

function Bonus::award(%this, %bonusData, %player1, %player2, %action, %suffix, %extraval, %sound)
{
   // Handle instant bonuses (previously handled via subclassing)
   if (%this.instant)
      return %this.awardInstantBonus(%bonusData, %player1, %player2, %action, %suffix, %extraval, %sound);

   if (%bonusData !$= "")
      %val = %bonusData.getValue();
   else
      %val = 0;
      
   if (%extraval !$= "")
      %val += %extraval;
      
   if (%val < 0)
      %val = 0;

   // Send message to bonus display mechanism
   if (%val > 0)
      Game.updateCurrentBonusAmount(%val, %player1.team);
   
   if (%bonusData !$= "")
      %text = %bonusData.getString();
      
   if (%suffix !$= "")
      %text = %text SPC %suffix;
      
   if (%player1.team != %player2.team)
      %actionColor = "<color:dd0000>";
   else
      %actionColor = "<color:00dd00>";

   %player1Color = $TR2::teamColor[%player1.team];
   %player2Color = $TR2::teamColor[%player2.team];

    %summary = %player1Color @ getTaggedString(%player1.client.name)
                    SPC %actionColor @ %action
                    SPC %player2Color @ getTaggedString(%player2.client.name);
      
   messageAll('MsgTR2Event', "", %summary, %text, %val);

   if (%this.history !$= "")
      // Add to BonusHistory and calculate variance
      %this.history.add(%bonusData);
   else if (%bonusData !$= "")
      // Otherwise just get rid of it
      %bonusData.delete();
}

function Bonus::awardInstantBonus(%this, %bonusData, %player1, %player2, %action, %suffix, %extraVal, %sound)
{
   if (%bonusData !$= "")
      %val = %bonusData.getValue();
   else
      %val = 0;
      
   if (%extraVal !$= "")
      %val += %extraVal;

   if (%val < 0)
      %val = 0;

   if (%player2 !$= "")
      %summary = getTaggedString(%player1.client.name) SPC %action SPC
                    getTaggedString(%player2.client.name);
   //else if (%player1 !$= "")
   //   %summary = getTaggedString(%player1.client.name);

   // Send message to bonus display mechanism
   %scoringTeam = %player1.client.team;
   $teamScore[%scoringTeam] += %val;
   messageAll('MsgTR2SetScore', "", %scoringTeam, $teamScore[%scoringTeam]);

   if (%bonusData !$= "")
      %text = %bonusData.getString() SPC %suffix;
   else
      %text = %suffix;
      
   %scoringTeam = %player1.team;
   %otherTeam = (%scoringTeam == 1) ? 2 : 1;

   //messageAll('MsgTR2Event', "", %summary, %text, %val);
   messageTeam(%scoringTeam, 'MsgTR2InstantBonus', "\c4" @ %text SPC "\c3(+" @ %val @ ")");
   messageTeam(%otherTeam, 'MsgTR2InstantBonus', "\c4" @ %text SPC "\c3(+" @ %val @ ")");
   messageTeam(0, 'MsgTR2InstantBonus', "\c4" @ %text SPC "\c3(+" @ %val @ ")");

   if (%sound !$= "")
      serverPlay2D(%sound);
      
   if (%this.history !$= "")
      // Add to BonusHistory and calculate variance
      %this.history.add(%bonusData);
   else if (%bonusData !$= "")
      // Otherwise just get rid of it
      %bonusData.delete();
}


function FlagBonus::award(%this, %bonusData, %dropper, %grabber, %flag)
{
   // Hmm, should update this to use Parent::
   
   // Calculate bonus value
   %val = %bonusData.getValue();
   
   // Sneaky workaround so that some bonuses still display even though
   // they're worth nothing
   if (%val < 0)
      %val = 0;
      
   if (%val >= 20)
      ServerPlay2D(CrowdCheerSound);

   if (!%flag.atHome && !%flag.onGoal && !%flag.dropperKilled)
   {
      if (%flag.dropper.team == %grabber.team)
      {
         %actionColor = "<color:00dd00>";
         %ppoints = mCeil(%val / 2);
         %rpoints = mFloor(%val / 2);
         %grabber.client.score += %rpoints;
         %grabber.client.receivingScore += %rpoints;
         %flag.dropper.client.score += %ppoints;
         %flag.dropper.client.passingScore += %ppoints;
      } else {
         %actionColor = "<color:dd0000>";
         %grabber.client.score += %val;
         %grabber.client.interceptingScore += %val;
         %this.history.initialize();
         
         // If grabber was a goalie, count this as a save
         if (%grabber.client.currentRole $= Goalie)
            %grabber.client.saves++;
      }

      if (%flag.dropper.client !$= "")
      {
         %dropperColor = $TR2::teamColor[%dropper.team];
         %grabberColor = $TR2::teamColor[%grabber.team];
         %summary = %dropperColor @ getTaggedString(%dropper.client.name)
                    SPC %actionColor @ "to"
                    SPC %grabberColor @ getTaggedString(%grabber.client.name);
       }
   } else {
      // Handle regular flag pickups
      %summary = $TR2::teamColor[%grabber.team] @ getTaggedString(%grabber.client.name);
      %this.history.initialize();
   }

   // Add to BonusHistory and calculate variance
   %bonusData.recipient = %grabber;
   %this.history.add(%bonusData);

   // Use variance to calculate creativity
   %variance = %this.history.getVariance();
   CreativityBonus.evaluate(%variance, %grabber);

   // Send message to bonus display mechanism
   // <color:000000>
   Game.updateCurrentBonusAmount(%val, %grabber.team);
   messageAll('MsgTR2Event', "", %summary, %bonusData.getString(), %val);
}

function WeaponBonus::award(%this, %bonusData, %shooter, %victim)
{
   %shooter.client.fcHits++;
   if (%bonusData.getValue() >= 5)
      ServerPlay2D(MonsterSound);
   Parent::award(%this, %bonusData, %shooter, %victim, "immobilized", "Hit \c2(" @ getTaggedString(%shooter.client.name) @ ")");
}

function G4Bonus::award(%this, %bonusData, %plAttacker, %plVictim, %damageType, %damageLoc, %val)
{
   Parent::award(%this, %bonusData, %plAttacker, %plVictim, "G4'd",
                 "Bionic Grab", %val);
}

function CollisionBonus::award(%this, %bonusData, %plPasser, %plReceiver, %action, %desc, %val)
{
   Parent::award(%this, %bonusData, %plPasser, %plReceiver, %action, %desc, %val);
}

