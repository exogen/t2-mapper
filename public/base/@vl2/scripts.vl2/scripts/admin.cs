// These have been secured against all those wanna-be-hackers. 
$VoteMessage["VoteAdminPlayer"] = "Admin Player";
$VoteMessage["VoteKickPlayer"] = "Kick Player";
$VoteMessage["BanPlayer"] = "Ban Player";
$VoteMessage["VoteChangeMission"] = "change the mission to";
$VoteMessage["VoteTeamDamage", 0] = "enable team damage";
$VoteMessage["VoteTeamDamage", 1] = "disable team damage";
$VoteMessage["VoteTournamentMode"] = "change the server to";
$VoteMessage["VoteFFAMode"] = "change the server to";
$VoteMessage["VoteChangeTimeLimit"] = "change the time limit to";
$VoteMessage["VoteMatchStart"] = "start the match";
$VoteMessage["VoteGreedMode", 0] = "enable Hoard Mode";
$VoteMessage["VoteGreedMode", 1] = "disable Hoard Mode";
$VoteMessage["VoteHoardMode", 0] = "enable Greed Mode";
$VoteMessage["VoteHoardMode", 1] = "disable Greed Mode";

function serverCmdStartNewVote(%client, %typeName, %arg1, %arg2, %arg3, %arg4, %playerVote)
{
   //DEMO VERSION - only voteKickPlayer is allowed
   if ((isDemo()) && %typeName !$= "VoteKickPlayer")
   {
      messageClient(%client, '', "All voting options except to kick a player are disabled in the DEMO VERSION.");
      return;
   }

   // haha - who gets the last laugh... No admin for you!
   if( %typeName $= "VoteAdminPlayer" && !$Host::allowAdminPlayerVotes )
      return;

   %typePass = true;
   
   // if not a valid vote, turn back. 
   if( $VoteMessage[ %typeName ] $= "" && %typeName !$= "VoteTeamDamage" )
      if( $VoteMessage[ %typeName ] $= "" && %typeName !$= "VoteHoardMode" )
         if( $VoteMessage[ %typeName ] $= "" && %typeName !$= "VoteGreedMode" )
            %typePass = false;
      
   if(( $VoteMessage[ %typeName, $TeamDamage ] $= "" && %typeName $= "VoteTeamDamage" ))
      %typePass = false;

   if( !%typePass )
      return; // -> bye ;)

   // z0dd - ZOD, 10/03/02. This was busted, BanPlayer was never delt with.
   if( %typeName $= "BanPlayer" )
   {
      if( !%client.isSuperAdmin || %arg1.isAdmin )
      {
         return; // -> bye ;)
      }
      else
      {
         ban( %arg1, %client );
         return;
      }
   }
   
   %isAdmin = ( %client.isAdmin || %client.isSuperAdmin );
   
   // keep these under the server's control. I win.
   if( !%playerVote )
      %actionMsg = $VoteMessage[ %typeName ];
   else if( %typeName $= "VoteTeamDamage" || %typeName $= "VoteGreedMode" || %typeName $= "VoteHoardMode" )
      %actionMsg = $VoteMessage[ %typeName, $TeamDamage ];
   else
      %actionMsg = $VoteMessage[ %typeName ];
   
   if( !%client.canVote && !%isAdmin )
      return;
   
   if ( !%isAdmin || ( ( %arg1.isAdmin && ( %client != %arg1 ) ) ) )
   {
      %teamSpecific = false;
	   %gender = (%client.sex $= "Male" ? 'he' : 'she');
      if ( Game.scheduleVote $= "" ) 
      {
         %clientsVoting = 0;

			//send a message to everyone about the vote...
         if ( %playerVote )
	      {   
            %teamSpecific = ( %typeName $= "VoteKickPlayer" ) && ( Game.numTeams > 1 );
            %kickerIsObs = %client.team == 0;
            %kickeeIsObs = %arg1.team == 0;
            %sameTeam = %client.team == %arg1.team;
            
            if( %kickeeIsObs )
            {
               %teamSpecific = false;
               %sameTeam = false;  
            }
            
            if(( !%sameTeam && %teamSpecific) && %typeName !$= "VoteAdminPlayer")
            {
               messageClient(%client, '', "\c2Player votes must be team based.");
               return;
            }

            // kicking is team specific
            if( %typeName $= "VoteKickPlayer" )
            {
               if(%arg1.isSuperAdmin)
               {
                  messageClient(%client, '', '\c2You can not %1 %2, %3 is a Super Admin!', %actionMsg, %arg1.name, %gender);
                  return;
               }
               
               Game.kickClient = %arg1;
               Game.kickClientName = %arg1.name;
               Game.kickGuid = %arg1.guid;
               Game.kickTeam = %arg1.team;

               if(%teamSpecific)
               {   
                  for ( %idx = 0; %idx < ClientGroup.getCount(); %idx++ ) 
                  {
                     %cl = ClientGroup.getObject( %idx );
            
                     if (%cl.team == %client.team && !%cl.isAIControlled())
                     {   
                        messageClient( %cl, 'VoteStarted', '\c2%1 initiated a vote to %2 %3.', %client.name, %actionMsg, %arg1.name); 
                        %clientsVoting++;
                     }
                  }
               }
               else
               {
                  for ( %idx = 0; %idx < ClientGroup.getCount(); %idx++ )
                  {
                     %cl = ClientGroup.getObject( %idx );
                     if ( !%cl.isAIControlled() )
                     {
                        messageClient( %cl, 'VoteStarted', '\c2%1 initiated a vote to %2 %3.', %client.name, %actionMsg, %arg1.name); 
                        %clientsVoting++;
                     }
                  }
               }
            }
            else
            {
               for ( %idx = 0; %idx < ClientGroup.getCount(); %idx++ )
               {
                  %cl = ClientGroup.getObject( %idx );
                  if ( !%cl.isAIControlled() )
                  {
                     messageClient( %cl, 'VoteStarted', '\c2%1 initiated a vote to %2 %3.', %client.name, %actionMsg, %arg1.name); 
                     %clientsVoting++;
                  }
               }
            }   
         }
         else if ( %typeName $= "VoteChangeMission" )
         {
            for ( %idx = 0; %idx < ClientGroup.getCount(); %idx++ )
            {
               %cl = ClientGroup.getObject( %idx );
               if ( !%cl.isAIControlled() )
               {
                  messageClient( %cl, 'VoteStarted', '\c2%1 initiated a vote to %2 %3 (%4).', %client.name, %actionMsg, %arg1, %arg2 );
                  %clientsVoting++;
               }
            }
         }
         else if (%arg1 !$= 0)
         {
				if (%arg2 !$= 0)
		      {   
               if(%typeName $= "VoteTournamentMode")
               {   
                  %admin = getAdmin();
                  if(%admin > 0)
                  {
                     for ( %idx = 0; %idx < ClientGroup.getCount(); %idx++ )
                     {
                        %cl = ClientGroup.getObject( %idx );
                        if ( !%cl.isAIControlled() )
                        {
                           messageClient( %cl, 'VoteStarted', '\c2%1 initiated a vote to %2 Tournament Mode (%3).', %client.name, %actionMsg, %arg1); 
                           %clientsVoting++;
                        }
                     }
                  }
                  else
                  {   
                     messageClient( %client, 'clientMsg', 'There must be a server admin to play in Tournament Mode.');
                     return; 
                  }
               }
               else
               {
                  for ( %idx = 0; %idx < ClientGroup.getCount(); %idx++ )
                  {
                     %cl = ClientGroup.getObject( %idx );
                     if ( !%cl.isAIControlled() )
                     {
                        messageClient( %cl, 'VoteStarted', '\c2%1 initiated a vote to %2 %3 %4.', %client.name, %actionMsg, %arg1, %arg2); 
                        %clientsVoting++;
                     }
                  }
				   }
            }
            else
            {
               for ( %idx = 0; %idx < ClientGroup.getCount(); %idx++ )
               {
                  %cl = ClientGroup.getObject( %idx );
                  if ( !%cl.isAIControlled() )
                  {
		               messageClient( %cl, 'VoteStarted', '\c2%1 initiated a vote to %2 %3.', %client.name, %actionMsg, %arg1);
                     %clientsVoting++;
                  }
               }
            }
         }
			else
         {
            for ( %idx = 0; %idx < ClientGroup.getCount(); %idx++ )
            {
               %cl = ClientGroup.getObject( %idx );
               if ( !%cl.isAIControlled() )
               {
	               messageClient( %cl, 'VoteStarted', '\c2%1 initiated a vote to %2.', %client.name, %actionMsg); 
                  %clientsVoting++;
               }
            }
         }

         // open the vote hud for all clients that will participate in this vote
         if(%teamSpecific)
         {
            for ( %clientIndex = 0; %clientIndex < ClientGroup.getCount(); %clientIndex++ ) 
            {
               %cl = ClientGroup.getObject( %clientIndex );
      
               if(%cl.team == %client.team && !%cl.isAIControlled())
                  messageClient(%cl, 'openVoteHud', "", %clientsVoting, ($Host::VotePassPercent / 100));    
            }
         }
         else
         {
            for ( %clientIndex = 0; %clientIndex < ClientGroup.getCount(); %clientIndex++ ) 
            {
               %cl = ClientGroup.getObject( %clientIndex );
               if ( !%cl.isAIControlled() )
                  messageClient(%cl, 'openVoteHud', "", %clientsVoting, ($Host::VotePassPercent / 100));    
            }
         }
         
         clearVotes();
         Game.voteType = %typeName;
         Game.scheduleVote = schedule( ($Host::VoteTime * 1000), 0, "calcVotes", %typeName, %arg1, %arg2, %arg3, %arg4 );
         %client.vote = true;
         messageAll('addYesVote', "");
         
         if(!%client.team == 0)
            clearBottomPrint(%client);
      }
      else
         messageClient( %client, 'voteAlreadyRunning', '\c2A vote is already in progress.' );	                       
   }
   else 
   {
      if ( Game.scheduleVote !$= "" && Game.voteType $= %typeName ) 
      {
         messageAll('closeVoteHud', "");
         cancel(Game.scheduleVote);
         Game.scheduleVote = "";
      }
      
      // if this is a superAdmin, don't kick or ban
      if(%arg1 != %client)
      {   
         if(!%arg1.isSuperAdmin)
         {
            // Set up kick/ban values:
            if ( %typeName $= "VoteBanPlayer" || %typeName $= "VoteKickPlayer" )
            {
               Game.kickClient = %arg1;
               Game.kickClientName = %arg1.name;
               Game.kickGuid = %arg1.guid;
               Game.kickTeam = %arg1.team;
            }
            
            //Tinman - PURE servers can't call "eval"
            //Mark - True, but neither SHOULD a normal server
            //     - thanks Ian Hardingham
            Game.evalVote(%typeName, true, %arg1, %arg2, %arg3, %arg4);
         }
         else
            messageClient(%client, '', '\c2You can not %1 %2, %3 is a Super Admin!', %actionMsg, %arg1.name, %gender);
      }      
   }
   
   %client.canVote = false;
   %client.rescheduleVote = schedule( ($Host::voteSpread * 1000) + ($Host::voteTime * 1000) , 0, "resetVotePrivs", %client );        
}

function resetVotePrivs( %client )
{
   //messageClient( %client, '', 'You may now start a new vote.');
   %client.canVote = true;
   %client.rescheduleVote = "";
}

function serverCmdSetPlayerVote(%client, %vote)
{
   // players can only vote once
   if( %client.vote $= "" )
   {
      %client.vote = %vote;
      if(%client.vote == 1)
         messageAll('addYesVote', "");
      else
         messageAll('addNoVote', "");

      commandToClient(%client, 'voteSubmitted', %vote);
   }
}

function calcVotes(%typeName, %arg1, %arg2, %arg3, %arg4)
{
   if(%typeName $= "voteMatchStart")
      if($MatchStarted || $countdownStarted)
         return;
   
   for ( %clientIndex = 0; %clientIndex < ClientGroup.getCount(); %clientIndex++ ) 
   {
      %cl = ClientGroup.getObject( %clientIndex );
      messageClient(%cl, 'closeVoteHud', "");
      
      if ( %cl.vote !$= "" ) 
      {
         if ( %cl.vote ) 
         {
            Game.votesFor[%cl.team]++;
            Game.totalVotesFor++;
         } 
         else 
         {
            Game.votesAgainst[%cl.team]++;
            Game.totalVotesAgainst++;
         }
      }
      else 
      {
         Game.votesNone[%cl.team]++;
         Game.totalVotesNone++;
      }
   }   
   //Tinman - PURE servers can't call "eval"
   //Mark - True, but neither SHOULD a normal server
   //     - thanks Ian Hardingham
   Game.evalVote(%typeName, false, %arg1, %arg2, %arg3, %arg4);
   Game.scheduleVote = "";
   Game.kickClient = "";
   clearVotes();
}

function clearVotes()
{
   for(%clientIndex = 0; %clientIndex < ClientGroup.getCount(); %clientIndex++)
   {   
      %client = ClientGroup.getObject(%clientIndex);
      %client.vote = "";
      messageClient(%client, 'clearVoteHud', ""); 
   }
   
   for(%team = 1; %team < 5; %team++) 
   {
      Game.votesFor[%team] = 0;
      Game.votesAgainst[%team] = 0;
      Game.votesNone[%team] = 0;
      Game.totalVotesFor = 0;
      Game.totalVotesAgainst = 0;
      Game.totalVotesNone = 0;
   }
}

// Tournament mode Stuff-----------------------------------

function setModeFFA( %mission, %missionType )
{
   if( $Host::TournamentMode )
   {
      $Host::TournamentMode = false;
      
      if( isObject( Game ) )
         Game.gameOver();
      
      loadMission(%mission, %missionType, false);   
   }
}

//------------------------------------------------------------------

function setModeTournament( %mission, %missionType )
{
   if( !$Host::TournamentMode )
   {
      $Host::TournamentMode = true;
      
      if( isObject( Game ) )
         Game.gameOver();
         
      loadMission(%mission, %missionType, false);   
   }
}
