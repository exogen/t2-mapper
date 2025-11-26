// Roles
$TR2::role[0] = Goalie;
$TR2::role[1] = Defense;
$TR2::role[2] = Offense;
$TR2::numRoles = 3;

// For some reason the above "strings" convert to all lowercase
$TR2::roleText[Goalie] = "Goalie";
$TR2::roleText[Defense] = "Defense";
$TR2::roleText[Offense] = "Offense";

$TR2::roleMax[Goalie] = 1;
$TR2::roleMax[Defense] = 2;
$TR2::roleMax[Offense] = 10;

$TR2::roleArmor[Goalie] = Heavy;
$TR2::roleArmor[Defense] = Medium;
$TR2::roleArmor[Offense] = Light;

// Roles are automated via concentric circles around goals
$TR2::roleDistanceFromGoal[Goalie] = 70;
$TR2::roleDistanceFromGoal[Defense] = 350;
$TR2::roleDistanceFromGoal[Offense] = 10000;

// Number of ticks needed before changing to this role
$TR2::roleTicksNeeded[Goalie] = 0;
$TR2::roleTicksNeeded[Defense] = 0;
$TR2::roleTicksNeeded[Offense] = 0;

// Extra items for roles
$TR2::roleExtraItem[Goalie0] = TR2Shocklance;
$TR2::roleExtraItemCount[Goalie0] = 1;
$TR2::roleExtraItem[Goalie1] = TR2Mortar;
$TR2::roleExtraItemCount[Goalie1] = 1;
$TR2::roleExtraItem[Goalie2] = TR2MortarAmmo;
$TR2::roleExtraItemCount[Goalie2] = 99;
$TR2::roleNumExtraItems[Goalie] = 3;

$TR2::roleExtraItem[Defense0] = TR2Shocklance;
$TR2::roleExtraItemCount[Defense0] = 1;
$TR2::roleNumExtraItems[Defense] = 1;

$TR2::roleNumExtraItems[Offense] = 0;

function debugPrintRoles()
{
   echo("**********************************ROLE PRINT");
}

function TR2Game::resetPlayerRoles(%game)
{
   %count = ClientGroup.getCount();
   for (%i = 0; %i < %count; %i++)
   {
      %cl = ClientGroup.getObject(%i);
      %game.releaseRole(%cl);
   }

   for (%i=0; %i<$TR2::numRoles; %i++)
      %game.initRole($TR2::Role[%i]);
}

function TR2Game::initRole(%game, %role)
{
   $numPlayers[%role @ 1] = 0;
   $numPlayers[%role @ 2] = 0;
}

function TR2Game::validateRoles(%game)
{
   // Recalculate role counts
   %count = ClientGroup.getCount();
   for (%i = 0; %i<$TR2::numRoles; %i++)
   {
     %role = $TR2::role[%i];
     %newCount[1] = 0;
     %newCount[2] = 0;
     
     for (%j = 0; %j<%count; %j++)
     {
        %cl = ClientGroup.getObject(%j);
         if (%cl.currentRole $= %role)
            %newCount[%cl.team]++;
     }
     $numPlayers[%role @ 1] = %newCount[1];
     $numPlayers[%role @ 2] = %newCount[2];
   }

   // Make sure that all players are in the armor they're supposed to be in
   for (%i = 0; %i < %count; %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (!isObject(%cl) || !isObject(%cl.player))
         continue;
         
      // If somehow the player is active, but has no role, set the outer role
      if (%cl.currentRole $= "")
         %game.assignOutermostRole(%cl);
         
      // If for some reason that wasn't possible, skip this player
      if (%cl.currentRole $= "")
         continue;

      %player = %cl.player;
      %armor = "TR2" @ $TR2::roleArmor[%cl.currentRole] @ %cl.sex @ HumanArmor;

         // Swap armors if necessary
         if (%player.getDataBlock().getName() !$= %armor)
         {
            // Don't allow an armor change if the player recently did something that requires
            // datablock access, such as impacting the terrain.  There is a T2 UE bug related
            // to concurrent datablock access.
            %time = getSimTime();
            if (%time - %player.delayRoleChangeTime <= $TR2::datablockRoleChangeDelay)
               return false;
            %damagePct = %player.getDamagePercent();
            %energyPct = %player.getEnergyPercent();
            %player.setDataBlock(%armor);
            %player.setDamageLevel(%damagePct * %player.getDataBlock().maxDamage);
            %player.setEnergyLevel(%energyPct * %player.getDataBlock().maxEnergy);
         }
   }
}

function TR2Game::trySetRole(%game, %player, %role)
{
   // Check concentric circles
   if (!isObject(%player))
      return false;

   // Don't allow an armor change if the player recently did something that requires
   // datablock access, such as impacting the terrain.  There is a T2 UE bug related
   // to concurrent datablock access.
   %time = getSimTime();
   if (%time - %player.delayRoleChangeTime <= $TR2::datablockRoleChangeDelay)
      return false;
      
    %position = %player.getPosition();
    %distanceToGoal = VectorLen(VectorSub(%position, $teamGoalPosition[%player.team]));

   if (%distanceToGoal > $TR2::roleDistanceFromGoal[%role])
   {
      %player.client.roleChangeTicks[%role] = 0;
      return false;
   }

   // See if a change is even necessary
   if (%player.client.currentRole $= %role)
   {
      return true;
   }

   // Make sure a spot is available
   if ($numPlayers[%role @ %player.team] >= $TR2::roleMax[%role])
    {
      //echo("****ROLES:  No slots left for " @ %role);
      return false;
    }
   // Make sure enough time has been spent in this zone
   if (%player.client.roleChangeTicks[%role] < $TR2::roleTicksNeeded[%role])
   {
      %player.client.roleChangeTicks[%role]++;
      return false;
   }

   %team = %player.team;


         // Change roles
         // First release the old role, if applicable
         if (%player.client.currentRole !$= "")
         {
            //echo("TEAM " @ %player.team @ " ROLE CHANGE:  "
            //  @ %player.client.currentRole
            //  @ "(" @ $numPlayers[%player.client.currentRole @ %team] @ ") "
            //  @ " to "
            //  @ %role
            //  @ "(" @ $numPlayers[%role @ %team] @ ")"
            //);
            $numPlayers[%player.client.currentRole @ %team]--;
         
            // Debug the decrement
            if ($numPlayers[%player.client.currentRole @ %team] < 0)
            {
               echo("**ROLE CHANGE ERROR:  negative role count");
               $numPlayers[%player.client.currentRole @ %team] = 0;
            }
         }

         // Now switch to the new role
         $numPlayers[%role @ %team]++;
         %newArmor = "TR2" @ $TR2::roleArmor[%role] @ %player.client.sex @ HumanArmor;
         %player.client.roleChangeTicks[%role] = 0;
         %player.setInvincible(false);

         // Swap armors if necessary
         if (%player.getDataBlock().getName() !$= %newArmor)
         {
            %damagePct = %player.getDamagePercent();
            %energyPct = %player.getEnergyPercent();
            //echo("   ROLE: " @ %damagePct @ " damage");
            //echo("   ROLE: " @ %energyPct @ " energy");
            //echo("   ROLE:  pre-armorSwitchSched = " @ %player.armorSwitchSchedule);
            %player.setDataBlock(%newArmor);
            //echo("   ROLE:  post-armorSwitchSched = " @ %player.armorSwitchSchedule);
            %player.setDamageLevel(%damagePct * %player.getDataBlock().maxDamage);
            %player.setEnergyLevel(%energyPct * %player.getDataBlock().maxEnergy);
         }
         %player.client.currentRole = %role;

         // Equipment changes
         %game.equipRoleWeapons(%player.client);

         messageClient(%player.client, 'TR2ArmorChange', "\c3ROLE CHANGE:  \c4" @ $TR2::roleText[%role] @ ".");
         serverPlay3D(RoleChangeSound, %player.getPosition());
         // Particle effect too?
         //%newEmitter = new ParticleEmissionDummy(RoleChangeEffect) {
			//position = %player.getTransform();
			//rotation = "1 0 0 0";
			//scale = "1 1 1";
			//dataBlock = "defaultEmissionDummy";
			//emitter = "RoleChangeEmitter";
			//velocity = "1";
           //};
          //%newEmitter.schedule(800, "delete");

          return true;
}

function TR2Game::updateRoles(%game)
{
   %count = ClientGroup.getCount();

   for (%i = 0; %i < %count; %i++)
   {
      %cl = ClientGroup.getObject(%i);
      if (%cl $= "" || %cl.player == 0 || %cl.player $= "")
         continue;

      %done = false;
      for (%j = 0; %j < $TR2::numRoles && !%done; %j++)
      {
         if (%game.trySetRole(%cl.player, $TR2::role[%j]))
            %done = true;
      }
   }
}

function TR2Game::equipRoleWeapons(%game, %client)
{
   %player = %client.player;

   // Get rid of existing extra weapon
   for (%i=0; %i<%client.extraRoleItems; %i++)
   {
      %item = %client.extraRoleItem[%i];
      
      // If the player is using the item we're about to take away, equip
      // the disc launcher
      %equippedWeapon = %player.getMountedImage($WeaponSlot).item;
      if (%equippedWeapon $= %item)
         %player.use(TR2Disc);
         
      %player.setInventory(%item, 0);
   }
   
   // Clear HUD
   %client.setWeaponsHudItem(TR2Shocklance, 0, 0);
   %client.setWeaponsHudItem(TR2Mortar, 0, 0);

   // Equip role items
   %client.extraRoleItems = $TR2::roleNumExtraItems[%client.currentRole];
   for (%i=0; %i<%client.extraRoleItems; %i++)
   {
      %item = $TR2::roleExtraItem[%client.currentRole @ %i];
      %roleItemAmount = $TR2::roleExtraItemCount[%client.currentRole @ %i];

      // Hmm, this actually works, but it remembers that you
      // lose your mortar ammo after a role switch.  Get rid of it
      // for now since there's unlimited mortar ammo anyway.
      //if (%client.restockAmmo || %roleItemAmount == 1)
         %itemAmount = %roleItemAmount;
      //else
      //   %itemAmount = %client.lastRoleItemCount[%i];
      %player.setInventory(%item, %itemAmount);
      %client.extraRoleItem[%i] = %item;
      %client.extraRoleItemCount[%i] = %itemAmount;
      
      // Re-equip, if necessary
      if (%item $= %equippedWeapon)
         %player.use(%item);
   }
   //echo("   ROLE:  weapons equipped.");
}

function TR2Game::releaseRole(%game, %client)
{
   if (%client.currentRole $= "")
      return;
      
   //echo("   ROLE:  client " @ %client @ " released " @ %client.currentRole);

   $numPlayers[%client.currentRole @ %client.team]--;
   %client.currentRole = "";
}

function TR2Game::assignOutermostRole(%game, %client)
{
   //$role[%client.currentRole @ %client.team @ %i] = "";
   //$numPlayers[%client.currentRole @ %client.team]--;
   //%client.currentRole = $TR2::role[$TR2::numRoles-1];
   //echo("   ROLE:  assigning outermost");
   %outerRole = $TR2::role[$TR2::numRoles-1];
   if (%client.player > 0 && %client.currentRole !$= %outerRole)
      %game.trySetRole(%client.player, %outerRole);
}

