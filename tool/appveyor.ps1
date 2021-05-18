Add-Type -AssemblyName "Microsoft.SqlServer.Smo"
Add-Type -AssemblyName "Microsoft.SqlServer.SqlWmiManagement"

powershell Get-Service MSSQL*

$instancename = $args[0];

$wmi = New-Object('Microsoft.SqlServer.Management.Smo.Wmi.ManagedComputer');
$tcp = $wmi.GetSmoObject("ManagedComputer[@Name='${env:computername}']/ServerInstance[@Name='${instancename}']/ServerProtocol[@Name='Tcp']");
$tcp.IsEnabled = $true;
$tcp.Alter();

Start-Service -Name "MSSQL`$$instancename";

$wmi = New-Object('Microsoft.SqlServer.Management.Smo.Wmi.ManagedComputer');
$ipall = $wmi.GetSmoObject("ManagedComputer[@Name='${env:computername}']/ServerInstance[@Name='${instancename}']/ServerProtocol[@Name='Tcp']/IPAddress[@Name='IPAll']");
$port = $ipall.IPAddressProperties.Item("TcpDynamicPorts").Value;
