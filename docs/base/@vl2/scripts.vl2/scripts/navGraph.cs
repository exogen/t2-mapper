//
// functions for ai nav graph
//

$OFFLINE_NAV_BUILD = false;

function NavGraph::generateInterior()
{
   %p = new FloorPlan();
   %p.generate();
   %p.upload();
   %p.delete();
}

//----------------------------------------------------------------------------

function NavGraph::exteriorInspect()
{
   %eInspector = new GroundPlan();
   
   %area = MissionArea.getArea();
   %minx = getWord(%area, 0);
   %miny = getWord(%area, 1);
   %extentx = getWord(%area, 2);
   %extenty = getWord(%area, 3);
   %point = %minx @ " " @ %miny;
   %extents = %extentx @ " " @ %extenty;
   
   %eInspector.inspect(%point, %extents); // this does the upload as well
   %eInspector.delete();
}

//----------------------------------------------------------------------------

function BuildNavigationGraph(%type)
{
   exec("scripts/graphBuild.cs");
   
   echo("Building Navigation Graph...");
   
   // disable asserts
   $FP::DisableAsserts = true;
   $OFFLINE_NAV_BUILD = true;
   
   if(%type $= "nav")
   {
      makeJettableGraphOffline(Nav);
      doTablebuildOffline(); 
   }
   else if(%type $= "spn")
      makeJettableGraphOffline(Spawn);
   else
      echo("unknown type for nav build!");
   
   navGraph.saveGraph();
   writeNavMetrics();
}

function NavigationGraph::navBuildComplete()
{
   echo( "Navigation Graph build complete." );
   
   if( $OFFLINE_NAV_BUILD )
   {   
      quit();
   }
}

// this will keep mod authors happy since they can create new 
// traversable shapes, and it will be handled by the navigation system
function FloorPlan::staticShapeListConstruct(%this)
{
   %group = nameToId("MissionGroup");
   %group.findStaticShapes(%this);
}

function FloorPlan::gameBaseListConstruct(%this)
{
   %group = nameToId("MissionGroup");
   %group.findGameBaseItems(%this);
}

function SimGroup::findGameBaseItems(%this, %floorPlan)
{
   for(%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).findGameBaseItems(%floorPlan);   
}

function GameBase::findGameBaseItems(%this, %floorPlan)
{
   %floorPlan.addHintPoint(%this.getWorldBoxCenter());
}

function SimGroup::findStaticShapes(%this, %floorPlan)
{
   for(%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).findStaticShapes(%floorPlan);   
}

function GameBase::findStaticShapes(%this, %floorPlan)
{
   %this.getDataBlock().findStaticShapes(%this, %floorPlan);
}

function StationInventory::findStaticShapes(%data, %object, %floorPlan)
{
   %floorPlan.addStaticCenter(%object);   
}

function StationVehiclePad::findStaticShapes(%data, %object, %floorPlan)
{
   %floorPlan.addStaticGeom(%object);   
}

function installNavThreats()
{
   %group = nameToId("MissionGroup");
   %group.findTurretThreats();
}

function SimObject::findTurretThreats(%this)
{
	//declared here
}

function SimGroup::findTurretThreats(%this)
{
   for(%i = 0; %i < %this.getCount(); %i++)
      %this.getObject(%i).findTurretThreats();   
}

function GameBase::findTurretThreats(%this)
{
   %this.getDataBlock().findTurretThreats(%this);
}

function TurretData::findTurretThreats(%data, %turret)
{
   %attackRadius = %turret.getMountedImage(0).attackRadius; 
   NavGraph.installThreat(%turret, %turret.team, %attackRadius);   
}

function fpStart(%useSpecial)
{
   $fp = new FloorPlan();
   $fp::special = %useSpecial;
   $fp.generate();
}

function fpEnd()
{
   if($fp > 0)
      $fp.delete();
}

function writeNavMetrics()
{
   navGraph.dumpInfo2File();
}