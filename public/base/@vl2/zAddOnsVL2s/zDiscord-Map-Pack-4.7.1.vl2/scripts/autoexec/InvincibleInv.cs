// For Small Crossing Inventorys
// SimpleFlagArena also uses this
// Grants Invinciblity

package InvincibleInv 
{

function StaticShapeData::damageObject(%data, %targetObject, %sourceObject, %position, %amount, %damageType)
{
    %targetname = %targetObject.getDataBlock().getName(); 
   //Used on some maps to make invs invincible
   if( %targetObject.invincible && %targetname $= "StationInventory" )
		return;

   parent::damageObject(%data, %targetObject, %sourceObject, %position, %amount, %damageType);
}

};

//Prevent package from being activated if it is already
if (!isActivePackage(InvincibleInv))
   activatePackage(InvincibleInv);