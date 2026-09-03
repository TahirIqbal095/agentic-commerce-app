# Keep protected commerce records beyond Guest Sessions

Guest checkout binds a Checkout Proposal and Approval to the active Guest
Session, but Orders, Payment Attempts, Provider identifiers, and their Audit
Events do not share the Guest Session's deletion lifecycle. Customer access to
the conversational checkout timeline ends when the browser credential expires
or is lost, while the Brand retains protected commerce records for operational
reconciliation. This deliberately favors payment integrity and audit evidence
without expanding the test-only checkout slice into accounts or recovery.
