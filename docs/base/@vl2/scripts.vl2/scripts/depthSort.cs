
moveMap.bindCmd(keyboard,o,"","toggleDepthTest();");
moveMap.bindCmd(keyboard,j,"","toggleDepthSort();");
moveMap.bindCmd(keyboard,k,"","toggleRenderDepth();");
moveMap.bindCmd(keyboard,l,"","toggleHoldDepthTest();");

function toggleDepthTest()
{
	if ($Collision::testDepthSortList)
   {
   	$Collision::testDepthSortList = false;
      echo("Turning OFF testing of DepthSortList");
   }
   else
   {
	   $Collision::testDepthSortList = true;
      echo("Turning ON testing of DepthSortList");
   }
}

function toggleDepthSort()
{
	if ($Collision::depthSort)
   {
   	$Collision::depthSort = false;
      echo("Turning OFF depth sort on depthSortList");
   }
   else
   {
	   $Collision::depthSort = true;
      echo("Turning ON depth sort on depthSortList");
   }
}

function toggleRenderDepth()
{
	if ($Collision::depthRender)
   {
   	$Collision::depthRender = false;
      echo("Turning OFF depth rendering on DepthSortList");
   }
   else
   {
   	$Collision::depthRender = true;
      echo("Turning ON depth rendering on DepthSortList");
   }
}

function toggleHoldDepthTest()
{
	if ($Collision::renderAlways)
   {
   	$Collision::renderAlways = false;
      $Collision::testDepthSortList = true;
   }
   else
   {
   	$Collision::renderAlways = true;
      $Collision::testDepthSortList = false;
   }
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=- //

