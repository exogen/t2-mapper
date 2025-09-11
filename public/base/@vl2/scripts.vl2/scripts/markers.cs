//------------------------------------------------------------------------------
//* Markers
//------------------------------------------------------------------------------

datablock MissionMarkerData(WayPointMarker)
{
   catagory = "Misc";
   shapeFile = "octahedron.dts";
};

datablock MissionMarkerData(SpawnSphereMarker)
{
   catagory = "Misc";
   shapeFile = "octahedron.dts";
};

datablock MissionMarkerData(AIObjectiveMarker)
{
   catagory = "Misc";
   shapeFile = "octahedron.dts";
};

datablock MissionMarkerData(FlagMarker)
{
   shapeFile = "octahedron.dts";
   hudImageNameFriendly[0] = "small_triangle";
   hudImageNameEnemy[0] = "small_triangle";
   hudRenderModulated[0] = true;
   hudRenderAlways[0] = true;
   hudRenderCenter[0] = true;
   hudRenderDistance[0] = true;
   hudRenderName[0] = true;
};

//------------------------------------------------------------------------------
// - serveral marker types may share MissionMarker datablock type
function MissionMarkerData::create(%block)
{
   switch$(%block)
   {
      case "WayPointMarker":
         %obj = new WayPoint() {
            dataBlock = %block;
         };
         return(%obj);
      case "SpawnSphereMarker":
         %obj = new SpawnSphere() {
            datablock = %block;
         };
         return(%obj);
      case "AIObjectiveMarker":
         %obj = new AIObjective() {
            datablock = %block;
         };
         return(%obj);
   }
   return(-1);
}