// offline graph building

$MAXNODECOUNT = 5000;   

function makeJettableGraphOffline(%NAVorSPAWN)
{
   if (%NAVorSPAWN $= "Spawn")
      echo("--> Building Spawn Graph");
   else
      echo("--> Building Nav Graph");

   // Inform what we're generating-    
   navGraph.setGenMode(%NAVorSPAWN);
   
   // Upload ground and floor data- 
   navGraph::exteriorInspect();
   navGraph::generateInterior();
   
   // navGraph.makeGraph();
   // navGraph.findBridges();
   // navGraph.pushBridges();
   
   navGraph.assemble();
   navGraph.cullIslands();

   navGraph.makeGraph();
   navGraph.pushBridges();
   navGraph.makeTables();
   
   return false;   
}

function doTablebuildOffline()
{
   navGraph.prepLOS("0 0 0");
   while(navGraph.makeLOS())
      %percent++;
}

