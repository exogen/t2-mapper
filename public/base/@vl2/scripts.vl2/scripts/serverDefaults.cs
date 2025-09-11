$Host::teamSkin[0] = "blank";
$Host::teamSkin[1] = "base";
$Host::teamSkin[2] = "baseb";
$Host::teamSkin[3] = "swolf";
$Host::teamSkin[4] = "dsword";
$Host::teamSkin[5] = "beagle";
$Host::teamSkin[6] = "cotp";

$Host::teamName[0] = "Unassigned";
$Host::teamName[1] = "Storm";
$Host::teamName[2] = "Inferno";
$Host::teamName[3] = "Starwolf";
$Host::teamName[4] = "Diamond Sword";
$Host::teamName[5] = "Blood Eagle";
$Host::teamName[6] = "Phoenix";

$Host::holoName[0] = "";
$Host::holoName[1] = "Storm";
$Host::holoName[2] = "Inferno";
$Host::holoName[3] = "Starwolf";
$Host::holoName[4] = "DSword";
$Host::holoName[5] = "BloodEagle";
$Host::holoName[6] = "Harbinger";

// Demo-specific preferences:
if ( isDemo() )
{
   $Host::GameName = "Tribes 2 Demo Server";
   $Host::Info = "This is a Tribes 2 Demo Server.";
   $Host::Map = "SlapDash";
   $Host::MaxPlayers = 32;
}
else
{
   $Host::GameName = "Tribes 2 Server";
   $Host::Info = "This is a Tribes 2 Server.";
   $Host::Map = "Katabatic";
   $Host::MaxPlayers = 64;
}
                  
$Host::AdminList = "";       // all players that will be automatically an admin upon joining server
$Host::SuperAdminList = "";  // all players that will be automatically a super admin upon joining server               
$Host::BindAddress = "";     // set to an ip address if the server wants to specify which NIC/IP to use                        
$Host::Port = 28000;
$Host::Password = "";
$Host::AdminPassword = "";
$Host::PureServer = 1;
$Host::Dedicated = 0;
$Host::MissionType = "CTF";
$Host::TimeLimit = 30;
$Host::BotCount = 2;
$Host::BotsEnabled = 0;
$Host::MinBotDifficulty = 0.5;
$Host::MaxBotDifficulty = 0.75;
$Host::NoSmurfs = 0;
$Host::VoteTime = 30;               // amount of time before votes are calculated
$Host::VotePassPercent = 60;        // percent needed to pass a vote
$Host::KickBanTime = 300;           // specified in seconds
$Host::BanTime = 1800;              // specified in seconds
$Host::PlayerRespawnTimeout = 60;   // time before a dead player is forced into observer mode
$Host::warmupTime = 20;
$Host::TournamentMode = 0;
$Host::allowAdminPlayerVotes = 1;
$Host::FloodProtectionEnabled = 1;
$Host::MaxMessageLen = 120;
$Host::VoteSpread = 20;
$Host::TeamDamageOn = 0;
$Host::Siege::Halftime = 20000;
$Host::CRCTextures = 1;

// 0: .v12 (1.2 kbits/sec), 1: .v24 (2.4 kbits/sec), 2: .v29 (2.9kbits/sec)
// 3:  GSM (6.6 kbits/sec)
$Audio::maxEncodingLevel = 3;
$Audio::maxVoiceChannels = 2;

$Host::MapPlayerLimits["Abominable", "CnH"] = "-1 -1";
$Host::MapPlayerLimits["AgentsOfFortune", "TeamHunters"] = "-1 32";
$Host::MapPlayerLimits["Alcatraz", "Siege"] = "-1 48";
$Host::MapPlayerLimits["Archipelago", "CTF"] = "16 -1";
$Host::MapPlayerLimits["AshesToAshes", "CnH"] = "16 -1";
$Host::MapPlayerLimits["BeggarsRun", "CTF"] = "-1 32";
$Host::MapPlayerLimits["Caldera", "Siege"] = "-1 48";
$Host::MapPlayerLimits["CasernCavite", "Hunters"] = "-1 32";
$Host::MapPlayerLimits["CasernCavite", "DM"] = "-1 32";
$Host::MapPlayerLimits["CasernCavite", "Bounty"] = "-1 32";
$Host::MapPlayerLimits["Damnation", "CTF"] = "-1 32";
$Host::MapPlayerLimits["DeathBirdsFly", "CTF"] = "8 -1";
$Host::MapPlayerLimits["Desiccator", "CTF"] = "-1 -1";
$Host::MapPlayerLimits["DustToDust", "CTF"] = "-1 32";
$Host::MapPlayerLimits["DustToDust", "Hunters"] = "-1 32";
$Host::MapPlayerLimits["DustToDust", "TeamHunters"] = "-1 32";
$Host::MapPlayerLimits["Equinox", "CnH"] = "-1 -1";
$Host::MapPlayerLimits["Equinox", "DM"] = "-1 32";
$Host::MapPlayerLimits["Escalade", "Hunters"] = "8 -1";
$Host::MapPlayerLimits["Escalade", "TeamHunters"] = "8 -1";
$Host::MapPlayerLimits["Escalade", "DM"] = "16 -1";
$Host::MapPlayerLimits["Escalade", "Bounty"] = "16 32";
$Host::MapPlayerLimits["Escalade", "Rabbit"] = "16 -1";
$Host::MapPlayerLimits["Firestorm", "CTF"] = "-1 24";
$Host::MapPlayerLimits["Firestorm", "CnH"] = "-1 24";
$Host::MapPlayerLimits["Flashpoint", "CnH"] = "-1 -1";
$Host::MapPlayerLimits["Gauntlet", "Siege"] = "-1 32";
$Host::MapPlayerLimits["Gehenna", "Hunters"] = "-1 -1";
$Host::MapPlayerLimits["Gehenna", "TeamHunters"] = "-1 -1";
$Host::MapPlayerLimits["Icebound", "Siege"] = "-1 -1";
$Host::MapPlayerLimits["Insalubria", "CnH"] = "-1 32";
$Host::MapPlayerLimits["JacobsLadder", "CnH"] = "-1 -1";
$Host::MapPlayerLimits["Katabatic", "CTF"] = "-1 48";
$Host::MapPlayerLimits["Masada", "Siege"] = "-1 32";
$Host::MapPlayerLimits["Minotaur", "CTF"] = "-1 32";
$Host::MapPlayerLimits["Myrkwood", "Hunters"] = "-1 32";
$Host::MapPlayerLimits["Myrkwood", "DM"] = "-1 32";
$Host::MapPlayerLimits["Myrkwood", "Rabbit"] = "-1 32";
$Host::MapPlayerLimits["Oasis", "DM"] = "-1 32";
$Host::MapPlayerLimits["Overreach", "CnH"] = "8 -1";
$Host::MapPlayerLimits["Quagmire", "CTF"] = "-1 -1";
$Host::MapPlayerLimits["Rasp", "TeamHunters"] = "-1 32";
$Host::MapPlayerLimits["Rasp", "Bounty"] = "-1 32";
$Host::MapPlayerLimits["Recalescence", "CTF"] = "16 -1";
$Host::MapPlayerLimits["Respite", "Siege"] = "-1 32";
$Host::MapPlayerLimits["Reversion", "CTF"] = "-1 -1";
$Host::MapPlayerLimits["Rimehold", "Hunters"] = "8 -1";
$Host::MapPlayerLimits["Rimehold", "Hunters"] = "8 -1";
$Host::MapPlayerLimits["Riverdance", "CTF"] = "-1 -1";
$Host::MapPlayerLimits["Sanctuary", "CTF"] = "-1 -1";
$Host::MapPlayerLimits["Sirocco", "CnH"] = "8 -1";
$Host::MapPlayerLimits["Slapdash", "CTF"] = "-1 -1";
$Host::MapPlayerLimits["SunDried", "DM"] = "8 -1";
$Host::MapPlayerLimits["SunDried", "Bounty"] = "8 -1";
$Host::MapPlayerLimits["Talus", "Bounty"] = "-1 32";
$Host::MapPlayerLimits["ThinIce", "CTF"] = "-1 -1";
$Host::MapPlayerLimits["Tombstone", "CTF"] = "-1 -1";
$Host::MapPlayerLimits["UltimaThule", "Siege"] = "8 -1";
$Host::MapPlayerLimits["Underhill", "DM"] = "-1 -1";
$Host::MapPlayerLimits["Underhill", "Bounty"] = "-1 32";
$Host::MapPlayerLimits["Whiteout", "DM"] = "8 -1";
$Host::MapPlayerLimits["Whiteout", "Bounty"] = "8 -1";
