# Understanding of the Access, Member and Assets table.

This will help you in understand how the access, member and assets table are connected to provide a seamless permission management system.

## ++Member Table++

The member table will list all the following fields and will work in the mentioned format.

| Field Name          | Field value and Description                 |
| ------------------- | ------------------------------------------- |
| id                  | uuid, primary key                           |
| member_type         | varchar (acc_in_acc, acc_in_port)           |
| child_account_id    | uuid, nullable, fk, references Account.id   |
| parent_account_id   | uuid, nullable, fk, references Account.id   |
| parent_portfolio_id | uuid, nullable, fk, references Portfolio.id |
| status              | varchar                                     |
| is_temporary        | datetime, nullable                          |

### ++How to use this table?++

1. if we're adding an account to an account, the member_type will be set to: `acc_in_acc`. We will set: `id`, `member_type`, `child_account_id`, `parent_account_id`, `status`, `is_temporary`.
2. if we're adding an account to an portfolio, the member_type will be set to: `acc_in_port`. We will set: `id`, `member_type`, `child_account_id`, `parent_portfolio_id`, `status`, `is_temporary`.

## ++Assets Table++

This table will list all the assets that are under any account or portfolio. The table has the following fields:

| Field Name           | Field value and Description                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                   | uuid, primary key                                                                                                                                       |
| type                 | Defines the asset type. The values can be like: `acc_in_port`, `conn_in_port`, `app_in_port`, `port_in_acc`, `acc_in_acc`, `conn_in_acc`, `app_in_acc` |
| child_account_id     | fk, references [Account.id](http://Account.id) -> delete on cascade kind of permission                                                                  |
| child_portfolio_id   | fk, references [Portfolio.id](http://Portfolio.id) -> delete on cascade kind of permission                                                              |
| child_connection_id  | fk, references [Connection.id](http://Connection.id) -> delete on cascade kind of permission                                                            |
| child_application_id | fk, references [Application.id](http://Application.id) -> delete on cascade kind of permission                                                          |
| parent_account_id    | fk, references [Account.id](http://Account.id) -> delete on cascade kind of permission                                                                  |
| parent_portfolio_id  | fk, references [Portfolio.id](http://portfolio.id) -> delete on cascade kind of permission                                                              |
| is_temporary         | datetime (nullable) -> if true set datetime, if false null.                                                                                             |
| status               | varchar, active, hold, removed                                                                                                                          |

### ++How this table will be used?++

1. If we're adding account in a portfolio, the asset type will be set to: `acc_in_port`. We will set: `id`, `asset_type`, `child_account_id`, `parent_portfolio_id`, `is_temporary`, `status`.
2. If we're connection in a portfolio, the asset type will be set to `conn_in_port`. We will set: `id`, `asset_type`, `child_connection_id`, `parent_portfolio_id`, `is_temporary`, `status`.
3. If we're adding application in a portfolio, the asset type will be set to `app_in_port`. We will set: `id`, `asset_type`, `child_application_id`, `parent_portfolio_id`, `is_temporary`, `status`.
4. If we're giving access to an account to an account, at this step as well, we need to add to assets table, the asset type will be set to: `acc_in_acc`. We will set: `id`, `asset_type`, `child_account_id`, `parent_account_id`, `is_temporary`, `status`.
5. If we're giving access to an connection to an account, at this step as well, we need to add to the assets table, the asset type will be set to: `conn_in_acc`. We will set `id`, `asset_type`, `child_connection_id`, `parent_account_id`, `is_temporary`, `status`.
6. If we're giving access to an application to an account, at this step as well, we need to add to the assets table, the asset type will be set to: `app_in_acc`. We will set `id`, `asset_type`, `child_application_id`, `parent_account_id`, `is_temporary`, `status`.
7. When someone (only account) has control of an portfolio, We will set the asset type to: `port_in_acc`. We will set: `id`, `asset_type`, `child_portfolio_id`, `parent_account_id`, `is_temporary`, `status`.
8. Note: A portfolio cannot be owned by another portfolio.

## ++Access Table++

The access table will have the fields like the following. Look at the table to understand the entire structure of the access table. This is a denormalized table and the structure is as:

| Field Name            | Field value/description                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                    |                                                                                                                                                                         |
| access_type           | `acc_self` for regular self grants, `acc_self.root` for root self grants, otherwise the asset relationship type                                                         |
| member_id             | references Member.id -> who's getting the access. Not nullable.                                                                                                         |
| member_account_id     | (denorm, references Member.member_account_id, nullable) -> who's getting access. main account id of that individual                                                     |
| parent_account_id     | (denorm, references Member.parent_account_id, nullable)-> who owns that account, if account owns it.                                                                    |
| parent_portfolio_id   | (denorm, references Member.parent_portfolio_id, nullable) -> if the owner of the asset we're getting access to is portfolio.                                            |
| asset_id              | references [Asset.id](http://Asset.id) -> what asset the user is getting. Not nullable.                                                                                 |
| asset_account_id      | (denorm, references Asset.child_account_id, not nullable) -> if the user is getting access to an account.                                                               |
| asset_connection_id   | (denorm, references Asset.child_connection_id, not nullable) -> if the user is getting acess to an connection.                                                          |
| asset_portfolio_id    | (denorm, references Asset.child_portfolio_id, not nullable) -> if the user is getting access to an portfolio.                                                           |
| asset_application_id  | (denorm, references Asset.child_application_id, not nullable) -> if the user is getting access to an application.                                                       |
| access_application_id | (denorm, references Application.id, nullable, only set in case of connection, the connection_id is for what application, this helps in finding the data at a fast pace) |
| is_temporary          | datetime (nullable) -> if null means its permanent, if date is set means the permission will be void automatically later on.                                            |
| role_id               | references role.id                                                                                                                                                      |
| status                | active, expired, hold                                                                                                                                                   |
| details               | for more details: []                                                                                                                                                    |

## ++Role Table++

How role table works at thsi phase.

| Field Name     | Field Value                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------- |
| id             | uuid, pk                                                                                      |
| name           | string                                                                                        |
| application_id | references application.id                                                                     |
| description    | description of the role                                                                       |
| permissions    | denormalized permssion json with just permission names ['permission1', 'permission2'] format. |
| tags           | jsonb []                                                                                      |
| details        | jsonb []                                                                                      |

there are also more tables like:

1. RolePermissionMap table.
2. Permission Table
