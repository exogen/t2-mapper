function weblinksmenu::defaultList(%this)
{
	addWebLink( "Tribes 2 Home Page", "www.tribes2.com" );
	addWebLink( "T2 Technical Information", "sierrastudios.com/games/tribes2/support" );
	addWebLink( "5 Assed Monkey", "www.5assedmonkey.com" );
	addWebLink( "Arc 2055", "www.arc2055.com" );
	addWebLink( "Atari Secret Society", "www.atarisecretsociety.org" );
	addWebLink( "BarrysWorld", "www.barrysworld.com" );
	addWebLink( "Bomb", "www.bomb.net" );
	addWebLink( "Clan Happytyme", "www.happytyme.com" );
	addWebLink( "ClanBase", "www.clanbase.com" );
	addWebLink( "ClanServ", "www.clanserv.com" );
	addWebLink( "Dopplegangers", "www.dopplegangers.com" );
	addWebLink( "Dutchbat Homeworld", "www.dutchbat-homeworld.com" );
	addWebLink( "eDome Tribes 2", "http://games.edome.net/tribes2/" );
	addWebLink( "Euro Tribesplayers", "www.euro-tribesplayers.com" );
	addWebLink( "eXtreme-Players", "www.eXtreme-players.de" );
	addWebLink( "Game Forces", "www.gforces.net" );
	addWebLink( "Game Planet", "www.gameplanet.co.nz" );
	addWebLink( "Game Surf", "www.gamesurf.de" );
	addWebLink( "Grave Diggers Union", "www.gravediggersunion.com" );
	addWebLink( "HomeLan", "www.homelan.com" );
	addWebLink( "IanStorm", "www.ianstorm.com" );
	addWebLink( "IMGaming", "www.imgaming.com" );
	addWebLink( "LAN Place", "www.lanplace.co.nz" );
	addWebLink( "Long Dongles", "www.longdongles.com" );
	addWebLink( "MaxBaud.Net", "www.maxbaud.net" );
	addWebLink( "MoreGaming", "www.moregaming.com" );
	addWebLink( "NetGames UK", "www.nguk.net" );
	addWebLink( "NGI", "www.ngi.it" );
	addWebLink( "PlanetTribes", "www.planettribes.com" );
	addWebLink( "Raging Angels", "www.ragingangels.org" );
	addWebLink( "Rogue Disciples", "www.roguedisciples.com" );
	addWebLink( "StrikeForce", "www.strikeforcecenter.com" );
	addWebLink( "Sydney Gamers League", "www.sgl.org.au" );
	addWebLink( "System Recall", "www.systemrecall.com" );
	addWebLink( "TeamSound", "www.teamsound.com" );
	addWebLink( "Telenordia", "www.telenordia.se" );
	addWebLink( "Telepresence Heavy Assault Team", "www.that.co.nz" );
	addWebLink( "Temple of Blood", "www.templeofblood.com" );
	addWebLink( "The Ghostbear Tribe", "www.ghostbear.net" );
	addWebLink( "ToKrZ", "www.tokrz.com" );
	addWebLink( "Tribes Attack", "www.tribesattack.com" );
	addWebLink( "Tribes Center", "www.tribescenter.com" );
	addWebLink( "Tribes 2 Database", "www.tribes2database.com" );
	addWebLink( "Tribes Gamers", "www.tribesgamers.com" );
	addWebLink( "TribesMaps", "www.tribesmaps.com" );
	addWebLink( "TribalWar", "www.tribalwar.com" );
	addWebLink( "Tribes Worlds", "www.tribesworlds.com" );
	addWebLink( "Tribes-Universe", "www.tribes-universe.com" );
	addWebLink( "WirePlay", "www.wireplay.com.au" );
	//addWebLink( "Z Free", "games13.clear.net.nz" );
	//addWebLink( "Box Factory Games", "http://www.bfgames1.com" );
	//addWebLink( "Box Factory Games", "http://www.bfgn.hobbiton.org" );
	for ( %i = 0; %i < $WebLinkCount; %i++ )
		%this.add( $WebLink[%i, name], %i );
	weblinksmenu.setSelected(0);
}

function weblinksmenu::onDatabaseQueryResult(%this,%status,%resultstring,%key)
{
	if(%key != %this.key)
    	return;
	echo("RECV:" @ %status);
		switch$(%this.state)
		{
			case "fetchWeblink":
				if(getField(%status,0) == 0)
				{
					%this.isloaded = true;
					%this.state = "getLinks";
					$WebLink = "";
					%this.clear();
					%this.rownum = 0;
				}
				else
				{
					%this.state = "error";
					$WebLink = "";
					%this.clear();
					%this.defaultList();
				}
		}
}

function weblinksmenu::onDatabaseRow(%this,%row,%isLastRow,%key)
{
	if(%key != %this.key)
    	return;
    	
	echo("RECV:" @ %row);
    switch$(%this.state)
    {
		case "getLinks":
			if(getField(%row,0) $= "0")
			{
				addWebLink(getField(%row,1),getField(%row,2));
				%this.add( getField(%row,1), %this.rownum );
				%this.rownum++;
			}
			if(%isLastRow)    			
				weblinksmenu.setSelected(0);
    }	
}

