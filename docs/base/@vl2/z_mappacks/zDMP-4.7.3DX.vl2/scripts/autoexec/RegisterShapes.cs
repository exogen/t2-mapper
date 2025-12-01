package AddShapes
{
   function Creator::init(%this){
      parent::init(%this);
      %staticBase = %this.addGroup(0, "Custom Objects");
      for (%i = 1; %i <= $CSObjCount; %i++) {
         echo("This: " SPC $CSObjects[%i]);
         echo(getWord($CSObjects[%i], 2));

         %grp = %this.addGroup(%staticBase, getWord($CSObjects[%i], 0));
         echo("TSStatic::create(" @ getWord($CSObjects[%i], 2) @");");
         %this.addItem(%grp, getWord($CSObjects[%i], 1), "TSStatic::create(\"" @ getWord($CSObjects[%i], 2) @"\");");
      }
   }
};

if (!isActivePackage(AddShapes))
   activatePackage(AddShapes);

$CSObjects[$CSObjCount++] = "Organics BELgTree16Autumn borg16-autumn.dts 20 -3.0 0 0.8 1.5";
$CSObjects[$CSObjCount++] = "Organics BELgTree19Autumn borg19-autumn.dts 20 -3.0 0 0.8 1.5";
$CSObjects[$CSObjCount++] = "Organics PhoenixPlant1Dark porg1-dark.dts";

$CSObjects[$CSObjCount++] = "Misc VendingMachine vend.dts";

$CSObjects[$CSObjCount++] = "Misc GoonFlag rst-goonflag.dts";
$CSObjects[$CSObjCount++] = "Misc TaoBook rst-taobook.dts";
$CSObjects[$CSObjCount++] = "Misc TCMug rst-TCmug.dts";
$CSObjects[$CSObjCount++] = "Misc TNMug rst-TNmug.dts";
$CSObjects[$CSObjCount++] = "Misc Turtle rst-turtle.dts";
$CSObjects[$CSObjCount++] = "Misc Samifin rst-samifin.dts";
$CSObjects[$CSObjCount++] = "Misc ChocoTaco rst-chocotaco.dts";
$CSObjects[$CSObjCount++] = "Misc SantaHat rst-santahat.dts";
