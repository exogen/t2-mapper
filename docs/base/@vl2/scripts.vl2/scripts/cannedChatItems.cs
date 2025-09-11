//--------------------------------------------------------------------------
// 
// cannedChatItems.cs
// 
//--------------------------------------------------------------------------

$MinChatItemId = 0;
$MaxChatItemId = 0;

if ( !isObject( CannedChatItems ) )
   new SimGroup( CannedChatItems );

//--------------------------------------------------------------------------
function installChatItem( %command, %text, %audioFile, %animCel, %teamOnly, %defaultkeys, %play3D )
{
   %cmdId = getSubStr( %command, 1, strlen( %command ) - 1 );
	%name = getTaggedString(%command);
   //echo( "** cmdId = " @ %cmdId @ " **" );
   if ( !isObject( $ChatTable[%cmdId] ) )
   {
      if ( %animCel == 0 )
         %animation = "";
      else
         %animation = "cel" @ %animCel;

		//error("defvoicebinds="@$defaultVoiceBinds@",keyPress="@%keyPress@",keyCmd="@%keyCmd);
      $ChatTable[%cmdId] = new CannedChatItem()
      {
         name = %name;
         text = %text;
         audioFile = %audioFile;
         animation = %animation;
         teamOnly = %teamOnly;
         defaultKeys = %defaultkeys;
			play3D = %play3D;
      };
      CannedChatItems.add( $ChatTable[%cmdId] );

      if ( $MinChatItemId == 0 || %cmdId < $MinChatItemId )
         $MinChatItemId = %cmdId;
      if ( %cmdId > $MaxChatItemId )
         $MaxChatItemId = %cmdId;
   }
}

//--------------------------------------------------------------------------
function installChatItemCallback( %command, %callback )
{
   %cmdId = getSubStr( %command, 1, strlen( %command ) - 1 );

   // make sure there is a chat item created
   if(isObject($ChatTable[%cmdId]))
   {
      for(%i = 0; (%aCallback = $ChatCallbacks[%cmdId, %i]) !$= ""; %i++)
      {
         // dont allow multiple instances
         if(%aCallback == %callback)
            return;
      }

      $ChatCallbacks[%cmdId, %i] = %callback;
   }
}

function processChatItemCallbacks( %command )
{
   %cmdId = getSubStr( %command, 1, strlen( %command ) - 1 );

   // make sure an actual chat item
   if(isObject($ChatTable[%cmdId]))
      for(%i = 0; (%callback = $ChatCallbacks[%cmdId, %i]) !$= ""; %i++)
         call(%callback, $ChatTable[%cmdId]);
}

//--------------------------------------------------------------------------
// ANIMATIONS
installChatItem( 'ChatAnimAnnoyed', "", "vqk.move", 4, false, "VGAA", true );
installChatItem( 'ChatAnimGetSome', "", "gbl.brag", 3, false, "VGAG", true );
installChatItem( 'ChatAnimDance', "", "gbl.woohoo", 5, false, "VGAD", true );
installChatItem( 'ChatAnimSalute', "", "slf.tsk.generic", 1, false, "VGAS", true );
installChatItem( 'ChatAnimWave', "", "gbl.hi", 2, false, "VGAW", true );
installChatItem( 'ChatAnimSpec1', "", "gbl.obnoxious", 6, false, "VGAZ", true );
installChatItem( 'ChatAnimSpec2', "", "gbl.aww", 7, false, "VGAX", true );
installChatItem( 'ChatAnimSpec3', "", "gbl.awesome", 8, false, "VGAC", true );

//--------------------------------------------------------------------------
// ATTACK
installChatItem( 'ChatCmdAttack', "Attack!", "att.attack", 0, true, "VAA", false );
installChatItem( 'ChatCmdAttackBase', "Attack the enemy base!", "att.base", 0, true, "VAB", false );
installChatItem( 'ChatCmdAttackChase', "Recover our flag!", "att.chase", 0, true, "VAC", false );
installChatItem( 'ChatCmdAttackDistract', "Disrupt the enemy defense!", "att.distract", 0, true, "VAD", false );
installChatItem( 'ChatCmdAttackFlag', "Get the enemy flag!", "att.flag", 0, true, "VAF", false );
installChatItem( 'ChatCmdAttackGenerator', "Destroy the enemy generator!", "att.generator", 0, true, "VAG", false );
installChatItem( 'ChatCmdAttackObjective', "Attack the objective!", "att.objective", 0, true, "VAO", false );
installChatItem( 'ChatCmdAttackReinforce', "Reinforce the offense!", "att.reinforcements", 0, true, "VAR", false );
installChatItem( 'ChatCmdAttackSensors', "Destroy enemy sensors!", "att.sensors", 0, true, "VAS", false );
installChatItem( 'ChatCmdAttackTurrets', "Destroy enemy turrets!", "att.turrets", 0, true, "VAT", false );
installChatItem( 'ChatCmdAttackWait', "Wait for my signal before attacking!", "att.wait", 0, true, "VAW", false );
installChatItem( 'ChatCmdAttackVehicle', "Destroy the enemy vehicle!", "att.vehicle", 0, true, "VAV", false );

//--------------------------------------------------------------------------
// BASE
installChatItem( 'ChatBaseTaken', "Our base is taken.", "bas.taken", 0, true, "VBT", false );
installChatItem( 'ChatEnemyInBase', "The enemy's in our base.", "bas.enemy", 0, true, "VBE", false );
installChatItem( 'ChatBaseClear', "Our base is clear.", "bas.clear", 0, true, "VBC", false );
installChatItem( 'ChatCmdRetakeBase', "Retake our base!", "bas.retake", 0, true, "VBR", false );
installChatItem( 'ChatBaseSecure', "Our base is secure.", "bas.secure", 0, true, "VBS", false );

//--------------------------------------------------------------------------
// DEFENSE
installChatItem( 'ChatCmdDefendBase', "Defend our base!", "def.base", 0, true, "VDB", false );
installChatItem( 'ChatCmdDefendCarrier', "Cover our flag carrier!", "def.carrier", 0, true, "VDC", false );
installChatItem( 'ChatCmdDefendEntrances', "Defend the entrances!", "def.entrances", 0, true, "VDE", false );
installChatItem( 'ChatCmdDefendFlag', "Defend our flag!", "def.flag", 0, true, "VDF", false );
installChatItem( 'ChatCmdDefendGenerator', "Protect the generator!", "def.generator", 0, true, "VDG", false );
installChatItem( 'ChatCmdDefendMe', "Cover me!", "def.me", 0, true, "VDM", false );
installChatItem( 'ChatCmdDefendObjective', "Defend the objective!", "def.objective", 0, true, "VDO", false );
installChatItem( 'ChatCmdDefendReinforce', "Reinforce our defense!", "def.reinforce", 0, true, "VDR", false );
installChatItem( 'ChatCmdDefendSensors', "Defend our sensors!", "def.sensors", 0, true, "VDS", false );
installChatItem( 'ChatCmdDefendTurrets', "Defend our turrets!", "def.turrets", 0, true, "VDT", false );
installChatItem( 'ChatCmdDefendVehicle', "Defend our vehicle!", "def.vehicle", 0, true, "VDV", false );
installChatItem( 'ChatCmdDefendNexus', "Defend the nexus!", "def.nexus", 0, true, "VDN", false );

//--------------------------------------------------------------------------
// COMMAND RESPONSE
installChatItem( 'ChatCmdAcknowledged', "Command acknowledged.", "cmd.acknowledge", 0, true, "VCA", false );
installChatItem( 'ChatCmdWhat', "What's your assignment?", "cmd.bot", 0, true, "VCW", false );
installChatItem( 'ChatCmdCompleted', "Command completed.", "cmd.completed", 0, true, "VCC", false );
installChatItem( 'ChatCmdDeclined', "Command declined.", "cmd.decline", 0, true, "VCD", false );

//--------------------------------------------------------------------------
// ENEMY STATUS
installChatItem( 'ChatEnemyBaseDisabled', "Enemy base is disabled.", "ene.base", 0, true, "VEB", false );
installChatItem( 'ChatEnemyDisarray', "The enemy is disrupted. Attack!", "ene.disarray", 0, true, "VED", false );
installChatItem( 'ChatEnemyGeneratorDestroyed', "Enemy generator destroyed.", "ene.generator", 0, true, "VEG", false );
installChatItem( 'ChatEnemyRemotesDestroyed', "Enemy remote equipment destroyed.", "ene.remotes", 0, true, "VER", false );
installChatItem( 'ChatEnemySensorsDestroyed', "Enemy sensors destroyed.", "ene.sensors", 0, true, "VES", false );
installChatItem( 'ChatEnemyTurretsDestroyed', "Enemy turrets destroyed.", "ene.turrets", 0, true, "VET", false );
installChatItem( 'ChatEnemyVehicleDestroyed', "Enemy vehicle station destroyed.", "ene.vehicle", 0, true, "VEV", false );

//--------------------------------------------------------------------------
// FLAG
installChatItem( 'ChatFlagGotIt', "I have the enemy flag!", "flg.flag", 0, true, "VFF", false );
installChatItem( 'ChatCmdGiveMeFlag', "Give me the flag!", "flg.give", 0, true, "VFG", false );
installChatItem( 'ChatCmdReturnFlag', "Retrieve our flag!", "flg.retrieve", 0, true, "VFR", false );
installChatItem( 'ChatFlagSecure', "Our flag is secure.", "flg.secure", 0, true, "VFS", false );
installChatItem( 'ChatCmdTakeFlag', "Take the flag from me!", "flg.take", 0, true, "VFT", false );
installChatItem( 'ChatCmdHunterGiveFlags', "Give your flags to me!", "flg.huntergive", 0, true, "VFO", false );
installChatItem( 'ChatCmdHunterTakeFlags', "Take my flags!", "flg.huntertake", 0, true, "VFP", false );

//--------------------------------------------------------------------------
// GLOBAL COMPLIMENTS
installChatItem( 'ChatAwesome', "Awesome!", "gbl.awesome", 0, false, "VGCA", false );
installChatItem( 'ChatGoodGame', "Good game!", "gbl.goodgame", 0, false, "VGCG", false );
installChatItem( 'ChatNice', "Nice move!", "gbl.nice", 0, false, "VGCN", false );
installChatItem( 'ChatYouRock', "You rock!", "gbl.rock", 0, false, "VGCR", false );
installChatItem( 'ChatGreatShot', "Great shot!", "gbl.shooting", 0, false , "VGCS");

//--------------------------------------------------------------------------
// GLOBAL
installChatItem( 'ChatHi', "Hi.", "gbl.hi", 0, false, "VGH", false );
installChatItem( 'ChatBye', "Bye.", "gbl.bye", 0, false, "VGB", false );
installChatItem( 'ChatGlobalYes', "Yes.", "gbl.yes", 0, false, "VGY", false );
installChatItem( 'ChatGlobalNo', "No.", "gbl.no", 0, false, "VGN", false );
installChatItem( 'ChatAnyTime', "Any time.", "gbl.anytime", 0, false, "VGRA", false );
installChatItem( 'ChatDontKnow', "I don't know.", "gbl.dunno", 0, false, "VGRD", false );
installChatItem( 'ChatOops', "Oops!", "gbl.oops", 0, false, "VGO", false );
installChatItem( 'ChatQuiet', "Quiet!", "gbl.quiet", 0, false, "VGQ", false );
installChatItem( 'ChatShazbot', "Shazbot!", "gbl.shazbot", 0, false, "VGS", false );
installChatItem( 'ChatCheer', "Woohoo!", "gbl.woohoo", 0, false, "VGW", false );
installChatItem( 'ChatThanks', "Thanks.", "gbl.thanks", 0, false, "VGRT", false );
installChatItem( 'ChatWait', "Wait a sec.", "gbl.wait", 0, false, "VGRW", false );

//--------------------------------------------------------------------------
// TRASH TALK
installChatItem( 'ChatAww', "Aww, that's too bad!", "gbl.aww", 0, false, "VGTA", false );
installChatItem( 'ChatBrag', "I am the greatest!", "gbl.brag", 0, false, "VGTG", false );
installChatItem( 'ChatObnoxious', "That's the best you can do?", "gbl.obnoxious", 0, false, "VGTB", false );
installChatItem( 'ChatSarcasm', "THAT was graceful!", "gbl.sarcasm", 0, false, "VGTT", false );
installChatItem( 'ChatLearn', "When ya gonna learn?", "gbl.when", 0, false, "VGTW", false );

//--------------------------------------------------------------------------
// NEED
installChatItem( 'ChatNeedBombardier', "Need a bombardier.", "need.bombardier", 0, true, "VNB", false );
installChatItem( 'ChatNeedCover', "Need covering fire.", "need.cover", 0, true, "VNC", false );
installChatItem( 'ChatNeedDriver', "Need driver for ground vehicle.", "need.driver", 0, true, "VND", false );
installChatItem( 'ChatNeedEscort', "Vehicle needs escort.", "need.escort", 0, true, "VNE", false );
installChatItem( 'ChatNeedPilot', "Need pilot for turbograv.", "need.flyer", 0, true, "VNP", false );
installChatItem( 'ChatNeedPassengers', "Gunship ready! Need a ride?", "need.gunship", 0, true, "VNG", false );
installChatItem( 'ChatNeedHold', "Hold that vehicle! I'm coming!", "need.hold", 0, true, "VNH", false );
installChatItem( 'ChatNeedRide', "I need a ride!", "need.ride", 0, true, "VNR", false );
installChatItem( 'ChatNeedSupport', "Need vehicle support!", "need.support", 0, true, "VNS", false );
installChatItem( 'ChatNeedTailgunner', "Need a tailgunner.", "need.tailgunner", 0, true, "VNT", false );
installChatItem( 'ChatNeedDestination', "Where to?", "need.where", 0, true, "VNW", false );

//--------------------------------------------------------------------------
// REPAIR
installChatItem( 'ChatRepairBase', "Repair our base!", "rep.base", 0, true, "VRB", false );
installChatItem( 'ChatRepairGenerator', "Repair our generator!", "rep.generator", 0, true, "VRG", false );
installChatItem( 'ChatRepairMe', "Repair me!", "rep.me", 0, true, "VRM", false );
installChatItem( 'ChatRepairSensors', "Repair our sensors!", "rep.sensors", 0, true, "VRS", false );
installChatItem( 'ChatRepairTurrets', "Repair our turrets!", "rep.turrets", 0, true, "VRT", false );
installChatItem( 'ChatRepairVehicle', "Repair our vehicle station!", "rep.vehicle", 0, true, "VRV", false );

//--------------------------------------------------------------------------
// SELF ATTACK
installChatItem( 'ChatSelfAttack', "I will attack.", "slf.att.attack", 0, true, "VSAA", false );
installChatItem( 'ChatSelfAttackBase', "I'll attack the enemy base.", "slf.att.base", 0, true, "VSAB", false );
installChatItem( 'ChatSelfAttackFlag', "I'll go for the enemy flag.", "slf.att.flag", 0, true, "VSAF", false );
installChatItem( 'ChatSelfAttackGenerator', "I'll attack the enemy generator.", "slf.att.generator", 0, true, "VSAG", false );
installChatItem( 'ChatSelfAttackSensors', "I'll attack the enemy sensors.", "slf.att.sensors", 0, true, "VSAS", false );
installChatItem( 'ChatSelfAttackTurrets', "I'll attack the enemy turrets.", "slf.att.turrets", 0, true, "VSAT", false );
installChatItem( 'ChatSelfAttackVehicle', "I'll attack the enemy vehicle station.", "slf.att.vehicle", 0, true, "VSAV", false );

//--------------------------------------------------------------------------
// SELF DEFEND
installChatItem( 'ChatSelfDefendBase', "I'll defend our base.", "slf.def.base", 0, true, "VSDB", false );
installChatItem( 'ChatSelfDefend', "I'm defending.", "slf.def.defend", 0, true, "VSDD", false );
installChatItem( 'ChatSelfDefendFlag', "I'll defend our flag.", "slf.def.flag", 0, true, "VSDF", false );
installChatItem( 'ChatSelfDefendGenerator', "I'll defend our generator.", "slf.def.generator", 0, true, "VSDG", false );
installChatItem( 'ChatSelfDefendNexus', "I'll defend the nexus.", "slf.def.nexus", 0, true, "VSDN", false );
installChatItem( 'ChatSelfDefendSensors', "I'll defend our sensors.", "slf.def.sensors", 0, true, "VSDS", false );
installChatItem( 'ChatSelfDefendTurrets', "I'll defend our turrets.", "slf.def.turrets", 0, true, "VSDT", false );
installChatItem( 'ChatSelfDefendVehicle', "I'll defend our vehicle bay.", "slf.def.vehicle", 0, true, "VSDV", false );

//--------------------------------------------------------------------------
// SELF REPAIR
installChatItem( 'ChatSelfRepairBase', "I'll repair our base.", "slf.rep.base", 0, true, "VSRB", false );
installChatItem( 'ChatSelfRepairEquipment', "I'll repair our equipment.", "slf.rep.equipment", 0, true, "VSRE", false );
installChatItem( 'ChatSelfRepairGenerator', "I'll repair our generator.", "slf.rep.generator", 0, true, "VSRG", false );
installChatItem( 'ChatSelfRepair', "I'm on repairs.", "slf.rep.repairing", 0, true, "VSRR", false );
installChatItem( 'ChatSelfRepairSensors', "I'll repair our sensors.", "slf.rep.sensors", 0, true, "VSRS", false );
installChatItem( 'ChatSelfRepairTurrets', "I'll repair our turrets.", "slf.rep.turrets", 0, true, "VSRT", false );
installChatItem( 'ChatSelfRepairVehicle', "I'll repair our vehicle station.", "slf.rep.vehicle", 0, true, "VSRV", false );

//--------------------------------------------------------------------------
// SELF TASK
installChatItem( 'ChatTaskCover', "I'll cover you.", "slf.tsk.cover", 0, true, "VSTC", false );
installChatItem( 'ChatTaskSetupD', "I'll set up defenses.", "slf.tsk.defense", 0, true, "VSTD", false );
installChatItem( 'ChatTaskOnIt', "I'm on it.", "slf.tsk.generic", 0, true, "VSTO", false );
installChatItem( 'ChatTaskSetupRemote', "I'll deploy remote equipment.", "slf.tsk.remotes", 0, true, "VSTR", false );
installChatItem( 'ChatTaskSetupSensors', "I'll deploy sensors.", "slf.tsk.sensors", 0, true, "VSTS", false );
installChatItem( 'ChatTaskSetupTurrets', "I'll deploy turrets.", "slf.tsk.turrets", 0, true, "VSTT", false );
installChatItem( 'ChatTaskVehicle', "I'll get a vehicle ready.", "slf.tsk.vehicle", 0, true, "VSTV", false );

//--------------------------------------------------------------------------
// TARGET
installChatItem( 'ChatTargetAcquired', "Target acquired.", "tgt.acquired", 0, true, "VTA", false );
installChatItem( 'ChatCmdTargetBase', "Target the enemy base! I'm in position.", "tgt.base", 0, true, "VTB", false );
installChatItem( 'ChatTargetDestroyed', "Target destroyed!", "tgt.destroyed", 0, true, "VTD", false );
installChatItem( 'ChatCmdTargetFlag', "Target their flag! I'm in position.", "tgt.flag", 0, true, "VTF", false );
installChatItem( 'ChatTargetFire', "Fire on my target!", "tgt.my", 0, true, "VTM", false );
installChatItem( 'ChatTargetNeed', "Need a target painted!", "tgt.need", 0, true, "VTN", false );
installChatItem( 'ChatCmdTargetSensors', "Target their sensors! I'm in position.", "tgt.sensors", 0, true, "VTS", false );
installChatItem( 'ChatCmdTargetTurret', "Target their turret! I'm in position.", "tgt.turret", 0, true, "VTT", false );
installChatItem( 'ChatCmdTargetWait', "Wait! I'll be in range soon.", "tgt.wait", 0, true, "VTW", false );

//--------------------------------------------------------------------------
// WARNING
installChatItem( 'ChatWarnBomber', "Incoming bomber!", "wrn.bomber", 0, true, "VWB", false );
installChatItem( 'ChatWarnEnemies', "Incoming hostiles!", "wrn.enemy", 0, true, "VWE", false );
installChatItem( 'ChatWarnVehicles', "Incoming vehicles!", "wrn.vehicles", 0, true, "VWV", false );
installChatItem( 'ChatWarnShoot', "Watch where you're shooting!", "wrn.watchit", 0, true, "VWW", false );

//--------------------------------------------------------------------------
// VERY QUICK
installChatItem( 'ChatWelcome', "Any time.", "vqk.anytime", 0, true, "VVA", false );
installChatItem( 'ChatIsBaseSecure', "Is our base secure?", "vqk.base", 0, true, "VVB", false );
installChatItem( 'ChatCeaseFire', "Cease fire!", "vqk.ceasefire", 0, true, "VVC", false );
installChatItem( 'ChatDunno', "I don't know.", "vqk.dunno", 0, true, "VVD", false );
installChatItem( 'ChatHelp', "HELP!", "vqk.help", 0, true, "VVH", false );
installChatItem( 'ChatMove', "Move, please!", "vqk.move", 0, true, "VVM", false );
installChatItem( 'ChatTeamNo', "No.", "vqk.no", 0, true, "VVN", false );
installChatItem( 'ChatSorry', "Sorry.", "vqk.sorry", 0, true, "VVS", false );
installChatItem( 'ChatTeamThanks', "Thanks.", "vqk.thanks", 0, true, "VVT", false );
installChatItem( 'ChatTeamWait', "Wait, please.", "vqk.wait", 0, true, "VVW", false );
installChatItem( 'ChatTeamYes', "Yes.", "vqk.yes", 0, true, "VVY", false );
