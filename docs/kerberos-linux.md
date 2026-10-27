# Windows authentication from Linux (Kerberos)

`Trusted_Connection=yes` works on Linux and macOS as well as Windows. The
library does nothing special here: it hands the connection string to the
Microsoft ODBC driver, and the driver does the authentication.

- **Windows** - the driver uses the logged-on user's credentials (SSPI). It
  negotiates Kerberos, and falls back to NTLM where Kerberos is not available.
- **Linux / macOS** - the driver uses Kerberos only (GSSAPI). It reads the
  ticket from your Kerberos credential cache, so you need a ticket before you
  connect. There is no NTLM fallback.

No code changes are needed. The connection string is the same on every
platform:

```js
const sql = require('msnodesqlv8')

const connectionString =
  'Driver={ODBC Driver 18 for SQL Server};Server=sqlhost.corp.example.com;' +
  'Database=mydb;Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=yes;'

sql.query(connectionString, 'select suser_sname() as login, auth_scheme from sys.dm_exec_connections where session_id = @@spid', (err, rows) => {
  if (err) throw err
  console.log(rows) // [ { login: 'CORP\\jbloggs', auth_scheme: 'KERBEROS' } ]
})
```

`auth_scheme` tells you what the server actually negotiated.

## Interactive use: kinit and klist

1. Install the Kerberos client tools (`krb5-user` on Debian/Ubuntu,
   `krb5-workstation` on RHEL/Fedora).
2. Point `/etc/krb5.conf` at your domain. The realm is the AD domain in upper
   case:

   ```ini
   [libdefaults]
       default_realm = CORP.EXAMPLE.COM
       dns_lookup_kdc = true
   ```

3. Get a ticket, then check it:

   ```sh
   kinit jbloggs@CORP.EXAMPLE.COM   # prompts for the AD password
   klist                            # shows the krbtgt ticket and when it expires
   ```

4. Connect. Afterwards `klist` also shows a `MSSQLSvc/sqlhost.corp.example.com:1433`
   service ticket - that confirms the driver used Kerberos.

The ticket expires (often after 10 hours), so this suits development, not a
service.

## Services: a keytab and a renewal timer

For a process that must connect unattended, give it a domain service account
and store that account's key in a keytab file. The process then never sees a
password.

Create the keytab (or have your AD admins produce one with `ktpass`):

```sh
ktutil
ktutil:  addent -password -p svc_app@CORP.EXAMPLE.COM -k 1 -e aes256-cts-hmac-sha1-96
ktutil:  wkt /etc/myapp/svc_app.keytab
ktutil:  quit
chown myapp: /etc/myapp/svc_app.keytab && chmod 600 /etc/myapp/svc_app.keytab
```

Test it: `kinit -kt /etc/myapp/svc_app.keytab svc_app@CORP.EXAMPLE.COM && klist`.
If the account's password changes, the keytab must be made again.

Use a fixed file cache that both the renewal job and the app can see. The
default cache on some distributions is a per-login keyring, which a systemd
service cannot see.

`/etc/systemd/system/myapp-kinit.service`:

```ini
[Unit]
Description=Refresh Kerberos ticket for myapp

[Service]
Type=oneshot
User=myapp
Environment=KRB5CCNAME=FILE:/var/lib/myapp/krb5cc
ExecStart=/usr/bin/kinit -kt /etc/myapp/svc_app.keytab svc_app@CORP.EXAMPLE.COM
```

`/etc/systemd/system/myapp-kinit.timer`:

```ini
[Unit]
Description=Refresh Kerberos ticket for myapp every 4 hours

[Timer]
OnBootSec=1min
OnUnitActiveSec=4h

[Install]
WantedBy=timers.target
```

```sh
systemctl daemon-reload
systemctl enable --now myapp-kinit.timer
```

Run the Node app with the same cache, e.g. `Environment=KRB5CCNAME=FILE:/var/lib/myapp/krb5cc`
in its own unit. The SQL Server login is the service account
(`CORP\svc_app`), so grant that account the database permissions.

MIT Kerberos can also fetch tickets from a keytab by itself: set
`KRB5_CLIENT_KTNAME=/etc/myapp/svc_app.keytab` in the app's environment and no
timer is needed. The timer is easier to see and to debug.

## When it does not work

- **`Cannot generate SSPI context` / `GSSAPI ... No Kerberos credentials available`** -
  there is no valid ticket in the cache the process is using. Run `klist` as
  the same user with the same `KRB5CCNAME`.
- **`Server not found in Kerberos database`** - the server has no SPN for the
  name you used. Use the server's fully qualified DNS name, not an IP address
  or an alias, and ask your AD admins to check `setspn -L <sql service account>`
  lists `MSSQLSvc/<fqdn>:1433`.
- **Clock skew errors** - Kerberos needs the client clock within 5 minutes of
  the domain controller. Run NTP/chrony.
- **`auth_scheme` shows `NTLM`** - only possible from Windows. The SPN is
  missing or wrong, and the driver fell back. NTLM is deprecated by Microsoft,
  so fix the SPN.
