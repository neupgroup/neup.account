# Neup Documentation Standard

**Version:** 1.1.0

The Neup Documentation Standard defines a consistent, machine-readable format for keeping documentation close to the code it describes.

Documentation may be written:

1. Inside source-code comments.
2. Inside a `README.md` file for a folder or module.
3. Inside dedicated Markdown documentation files.

The same syntax can be parsed to generate public, private, internal, API, function, folder, and project documentation.

---

# 1. Root Documentation

Every project should contain a root `README.md`.

```text
project/
├── README.md
├── api/
├── src/
├── docs/
└── tests/
```

The root `README.md` acts as the main entry point and should contain:

* Project name
* Project summary
* Installation instructions
* Basic usage
* Project structure
* Documentation index
* Links to folder-level documentation

Example:

```md
# Project Name

Short description of the project.

## Documentation

- [API Documentation](api/README.md)
- [Source Documentation](src/README.md)
- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
```

---

# 2. Documentation Block

Every documentation block must begin with:

```text
::neup.documentation::documentation-id
```

and end with:

```text
::end
```

Example:

```text
::neup.documentation::create-account

Documentation content goes here.

::end
```

The documentation ID must be unique within the project.

Use lowercase kebab-case:

```text
create-account
get-user-profile
upload-file
generate-access-token
```

---

# 3. Minimal Documentation Block

```text
::neup.documentation::documentation-id

Short documentation.

::end
```

A block may describe:

* A function
* An API route
* A class
* A component
* A module
* A service
* A configuration
* A folder
* A database entity
* A command
* A general guide

---

# 4. Public and Private Documentation Sections

Public and private content are defined using dedicated sections.

## Public section

```text
::public

Content that may be published publicly.

::public end
```

## Private section

```text
::private

Content intended only for private or internal documentation.

::private end
```

## Both public and private content

A single documentation block may contain both:

```text
::neup.documentation::create-account
::api POST /api/accounts

::public

Creates a new account.

::public end

::private

The account is created inside a database transaction.

The authenticated user is automatically assigned as the account owner.

::private end

::end
```

The public documentation generator includes only the `::public` content.

The private documentation generator may include both public and private content.

---

# 5. Section Closing Rules

Public and private sections should normally be closed explicitly.

Correct:

```text
::public

Public documentation.

::public end

::private

Private documentation.

::private end

::end
```

The parser must also support this shortened form:

```text
::public

Public documentation.

::end
```

In this case, `::end` performs two actions:

1. It closes the currently open `::public` section.
2. It closes the entire documentation block.

The same behavior applies to a private section:

```text
::private

Private documentation.

::end
```

However, this form should generate a validation warning:

```text
Public section was closed implicitly by ::end.
Add ::public end before ::end.
```

or:

```text
Private section was closed implicitly by ::end.
Add ::private end before ::end.
```

The documentation should still be registered and processed.

The parser must not reject the block only because the visibility section was closed implicitly.

---

# 6. Unscoped Documentation Content

Content outside `::public` and `::private` sections is shared documentation.

Example:

```text
::neup.documentation::create-account
::api POST /api/accounts

Creates an account.

::public

This endpoint is available to authenticated API users.

::public end

::private

The implementation creates the account inside a transaction.

::private end

::end
```

The sentence `Creates an account.` is shared content.

Shared content may be included in both public and private documentation unless project configuration changes this behavior.

Recommended default:

```text
unscoped-content = shared
```

---

# 7. Function Documentation

Function documentation uses:

```text
::function functionName()
```

Example:

```text
::neup.documentation::get-accounts
::function getAccounts()

Returns all available accounts.

::end
```

Complete example:

```text
::neup.documentation::get-account
::function getAccount(accountId)

Returns an account by its identifier.

::param external accountId

The account identifier received from the function caller.

::returns Account

Returns the matching account.

::details

The function validates the identifier and retrieves the account from storage.

::end
```

---

# 8. Parameter Scope

Parameter scope describes the parameter's relationship to the function or code implementation.

It does not control documentation visibility.

Documentation visibility is controlled only by:

```text
::public
::public end
::private
::private end
```

A parameter is declared using:

```text
::param parameterName
```

or:

```text
::param scope parameterName
```

Example:

```text
::param external accountId
```

---

# 9. Recommended Parameter Scopes

## External

```text
::param external accountId
```

The value is accepted from outside the function.

Examples:

* Function arguments
* Method arguments
* API handler inputs
* Values supplied by another module

## Internal

```text
::param internal normalizedAccountId
```

The value is created or used only inside the function or implementation.

Examples:

* Local variables
* Computed values
* Internal helper values
* Intermediate state

## Captured

```text
::param captured currentUser
```

The value is available from the surrounding scope rather than passed directly.

Examples:

* Closure variables
* Module-level dependencies
* Context inherited from an outer function

## Injected

```text
::param injected database
```

The value is supplied through dependency injection.

Examples:

* Database clients
* Service instances
* Logger instances
* Configuration providers

## Global

```text
::param global applicationConfig
```

The value is read from application-level or global state.

## Environment

```text
::param environment DATABASE_URL
```

The value comes from an environment variable or runtime environment.

---

# 10. Default Parameter Scope

When no scope is provided:

```text
::param accountId
```

the default scope is:

```text
external
```

This is because documented function parameters are normally accepted from the function caller.

A project may override the default through configuration.

---

# 11. Parameter Metadata

Metadata belonging to a parameter is written below the parameter declaration.

```text
::param external accountId
::datatype string
::required true
::example acc_123456

The unique identifier of the account.
```

Recommended parameter metadata:

```text
::datatype string
::required true
::default value
::example value
::format uuid
::minimum 1
::maximum 100
::nullable false
::deprecated false
```

Example:

```text
::param external page
::datatype integer
::required false
::default 1
::minimum 1
::example 2

The requested page number.
```

---

# 12. Internal Variable Documentation

Variables created inside a function may also be documented.

```text
::param internal normalizedAccountId
::datatype string

The validated and normalized version of `accountId`.
```

Example:

```text
::neup.documentation::get-account
::function getAccount(accountId)

Retrieves an account.

::param external accountId
::datatype string

The identifier supplied by the caller.

::param internal normalizedAccountId
::datatype string

The normalized identifier used for the database query.

::end
```

---

# 13. API Documentation

API documentation uses:

```text
::api METHOD /path
```

Example:

```text
::api POST /api/accounts
```

Basic example:

```text
::neup.documentation::create-account
::api POST /api/accounts

Creates a new account.

::end
```

Example with public and private sections:

```text
::neup.documentation::create-account
::api POST /api/accounts

::public

Creates a new account for the authenticated user.

::param name

The account name.

::param currency

The default account currency.

::public end

::private

The endpoint calls `createAccount()` and creates all records inside a database
transaction.

The authenticated user becomes the account owner.

::private end

::end
```

---

# 14. API Parameters

API parameters use:

```text
::param parameterName
```

An API parameter may contain additional fields:

```text
::param accountId
::location path
::datatype string
::required true
::example acc_123456

The unique account identifier.
```

Supported locations:

```text
::location path
::location query
::location body
::location header
::location cookie
```

For API documentation, parameter scope is optional.

When used, scope still refers to code-level accessibility or origin:

```text
::param external accountId
```

It does not determine whether the parameter appears in public documentation.

Place the parameter inside `::public` or `::private` to control where it appears.

---

# 15. Public and Private API Parameters

Public parameter:

```text
::public

::param accountId
::location path
::datatype string
::required true

The account identifier.

::public end
```

Private implementation value:

```text
::private

::param internal normalizedAccountId
::datatype string

The normalized value used by the internal database query.

::private end
```

---

# 16. API Responses

Responses use:

```text
::response status-code
```

Example:

```text
::response 200

The request completed successfully.

::response 404

The requested account was not found.
```

Response metadata:

```text
::response 200
::content-type application/json

The account was returned successfully.
```

---

# 17. Function Returns

Function return values use:

```text
::returns
```

Example:

```text
::returns

The matching account.
```

With metadata:

```text
::returns
::datatype Promise<Account>
::nullable false

A promise that resolves to the matching account.
```

---

# 18. Errors

Errors use:

```text
::error ErrorName
```

Example:

```text
::error AccountNotFoundError

Thrown when the requested account does not exist.

::error PermissionDeniedError

Thrown when the caller cannot access the account.
```

Errors may appear inside public or private sections.

```text
::public

::error AccountNotFoundError

Returned when the requested account does not exist.

::public end

::private

::error DatabaseQueryError

Thrown when the internal database query fails.

::private end
```

---

# 19. Detailed Documentation

Longer documentation uses:

```text
::details
```

Example:

```text
::details

The function validates the account identifier before querying the database.

Archived accounts are excluded unless the caller explicitly requests them.
```

A `::details` field belongs to its current documentation section.

Public details:

```text
::public

::details

This endpoint returns the account visible to the authenticated user.

::public end
```

Private details:

```text
::private

::details

The handler uses the account repository and permission service internally.

::private end
```

---

# 20. Custom Fields

Any unknown field beginning with `::` may be stored as custom metadata.

Example:

```text
::owner Accounts Team
::service Account Service
::version 1.2.0
::since 1.0.0
::rate-limit 100 requests per minute
::cache 60 seconds
```

Custom field format:

```text
::field-name field value
```

Recommended field-name format:

```text
lowercase-kebab-case
```

Custom metadata should be displayed in the generated documentation unless the
field is configured as hidden.

---

# 21. Folder-Level Documentation

A folder may contain its own `README.md`.

Example:

```text
project/
├── README.md
├── api/
│   ├── README.md
│   ├── accounts/
│   ├── users/
│   └── files/
└── src/
```

The file:

```text
/api/README.md
```

documents the `api` folder and shared behavior for its child routes.

It may describe:

* Shared authentication
* Shared request formats
* Shared response formats
* Common errors
* Naming conventions
* Middleware
* Folder architecture
* Shared utilities
* Rules applying to child files and folders

---

# 22. Folder README Behavior

A `README.md` located inside a folder is associated with that folder.

Examples:

```text
/api/README.md
```

Documents:

```text
/api
```

```text
/api/accounts/README.md
```

Documents:

```text
/api/accounts
```

```text
/src/components/README.md
```

Documents:

```text
/src/components
```

The generated documentation hierarchy should follow the repository hierarchy.

Example:

```text
API
├── Shared API Documentation
├── Accounts
├── Users
└── Files
```

---

# 23. Folder Documentation Inheritance

Folder documentation may apply to child files and folders.

Example:

```text
/api/README.md
```

may contain:

```md
# API

All routes in this folder use JSON request and response bodies.

All protected endpoints require bearer authentication.

## Shared Errors

- `400` Invalid request
- `401` Authentication required
- `500` Internal server error
```

These rules may be displayed as shared documentation for:

```text
/api/accounts
/api/users
/api/files
```

Child folders may extend or override the shared documentation using their own
`README.md`.

Example:

```text
/api/README.md
/api/accounts/README.md
/api/accounts/create.ts
```

The documentation application should resolve documentation from broadest to
most specific:

```text
root README.md
→ /api/README.md
→ /api/accounts/README.md
→ source-file documentation
```

---

# 24. Documentation Without Modifying Source Code

Developers are not required to place documentation inside source files.

Documentation may be stored in a nearby `README.md` instead.

Example:

```text
api/
├── README.md
├── accounts/
│   ├── README.md
│   ├── create.ts
│   ├── update.ts
│   └── delete.ts
```

The folder documentation may contain standard documentation blocks:

```md
# Accounts API

::neup.documentation::create-account
::api POST /api/accounts

::public

Creates a new account.

::param name
::location body
::datatype string
::required true

The account name.

::public end

::private

Implemented in `create.ts`.

The route creates the account inside a database transaction.

::private end

::end
```

This allows documentation to exist without editing `create.ts`.

---


# 26. Source-Code Documentation

Documentation may be written inside language-supported comments.

## TypeScript and JavaScript

```ts
/*
::neup.documentation::get-account
::function getAccount(accountId)

::public

Returns an account by its identifier.

::public end

::private

Uses the account repository and permission service.

::private end

::param external accountId
::datatype string

The account identifier supplied by the caller.

::end
*/
```

## Go

```go
/*
::neup.documentation::get-account
::function GetAccount(accountID)

Returns an account by its identifier.

::param external accountID

The account identifier supplied by the caller.

::end
*/
```

## Python

```python
"""
::neup.documentation::get-account
::function get_account(account_id)

Returns an account by its identifier.

::param external account_id

The account identifier supplied by the caller.

::end
"""
```

## PHP

```php
/*
::neup.documentation::get-account
::function getAccount($accountId)

Returns an account by its identifier.

::param external accountId

The account identifier supplied by the caller.

::end
*/
```

## HTML

```html
<!--
::neup.documentation::account-form

Documents the account form component.

::end
-->
```

---

# 27. Complete Function Example

```ts
/*
::neup.documentation::get-account
::function getAccount(accountId)
::title Get Account
::owner Accounts Team

::public

Returns an account by its identifier.

::param external accountId
::datatype string
::required true

The unique account identifier.

::returns
::datatype Promise<Account>

A promise that resolves to the requested account.

::error AccountNotFoundError

Thrown when the account does not exist.

::public end

::private

::param internal normalizedAccountId
::datatype string

The validated and normalized account identifier used by the repository.

::param injected accountRepository
::datatype AccountRepository

The repository used to retrieve account records.

::details

The function normalizes the identifier, verifies access, and retrieves the
account from the account repository.

::error DatabaseQueryError

Thrown when the repository query fails.

::private end

::end
*/
async function getAccount(accountId: string): Promise<Account> {
  const normalizedAccountId = normalizeAccountId(accountId);
  return accountRepository.findById(normalizedAccountId);
}
```

---

# 28. Complete API Example

```text
::neup.documentation::create-account
::api POST /api/accounts
::title Create Account
::authentication bearer
::owner Accounts Team

::public

Creates an account for the authenticated user.

::param name
::location body
::datatype string
::required true
::example Primary Account

The account name.

::param currency
::location body
::datatype string
::required false
::default NPR

The account currency.

::response 201

The account was created successfully.

::response 400

The request contains invalid data.

::response 401

Authentication is required.

::public end

::private

::param internal normalizedName
::datatype string

The normalized account name used for duplicate checking.

::param injected accountRepository
::datatype AccountRepository

The repository used to create the account.

::details

The endpoint validates the request and creates the account inside a database
transaction.

The authenticated user is assigned as the account owner.

::error DuplicateAccountError

Raised when the user already has an account with the same normalized name.

::private end

::end
```

---

# 29. Parsing Rules

A compatible parser must follow these rules.

## Block detection

A block starts with:

```text
::neup.documentation::documentation-id
```

A block ends with:

```text
::end
```

## Visibility sections

A public section starts with:

```text
::public
```

and normally ends with:

```text
::public end
```

A private section starts with:

```text
::private
```

and normally ends with:

```text
::private end
```

## Implicit closing

When `::end` is encountered while a public or private section remains open:

1. Close the active section.
2. Register its content.
3. Close the documentation block.
4. Produce a warning requesting an explicit section-closing marker.

## Section state

Everything after `::public` is public until:

```text
::public end
```

or:

```text
::end
```

Everything after `::private` is private until:

```text
::private end
```

or:

```text
::end
```

## Field state

Content below a field belongs to that field until:

* Another field begins
* A visibility section changes
* A visibility section ends
* The documentation block ends

## Unknown fields

Unknown `::field-name` entries must be stored as custom metadata rather than
discarded.

## Comments

Source-language comment symbols must be removed before parsing.

## Markdown

Blank lines and Markdown formatting must be preserved.

---

# 30. Validation Warnings

The parser should accept recoverable documentation while generating warnings.

Examples:

```text
WARNING NDS001:
Public section was closed implicitly by ::end.
Add ::public end before ::end.
```

```text
WARNING NDS002:
Private section was closed implicitly by ::end.
Add ::private end before ::end.
```

```text
WARNING NDS003:
Documentation block contains no ::function, ::api, title, or general content.
```

```text
WARNING NDS004:
Documentation ID is duplicated.
```

```text
WARNING NDS005:
A parameter scope is not recognized.
```

Warnings should not stop documentation generation unless strict validation is
enabled.

---

# 31. Validation Errors

Errors should be reserved for documentation that cannot be safely parsed.

Examples:

```text
ERROR NDS101:
Documentation block does not contain ::end.
```

```text
ERROR NDS102:
Documentation block does not have an ID.
```

```text
ERROR NDS103:
A new documentation block started before the previous block ended.
```

---

# 32. Public Documentation Generation

A public documentation build includes:

* Shared unscoped content
* Content inside `::public`
* Public metadata
* Public examples
* Public parameters
* Public responses
* Public errors

It must exclude:

* Content inside `::private`
* Private implementation details
* Private examples
* Internal variables documented only in private sections
* Hidden metadata

Filtering must happen before the generated data reaches the public application.

Private content must not merely be hidden by frontend code.

---

# 33. Private Documentation Generation

A private documentation build may include:

* Shared unscoped content
* Public content
* Private content
* Implementation details
* Internal variables
* Injected dependencies
* Architecture notes
* Internal errors
* Source locations

The private application should visually distinguish public and private sections.

Example labels:

```text
PUBLIC
PRIVATE
SHARED
```

---

# 34. Folder Documentation Generation

When generating documentation for a source file, the application may combine:

1. Root project documentation
2. Parent folder documentation
3. Nearest folder documentation
4. File-level documentation
5. Inline code documentation

Example:

```text
README.md
/api/README.md
/api/accounts/README.md
/api/accounts/create.ts
```

The final page for `create.ts` may include relevant shared information from all
four levels.

The application should preserve the source of every inherited section.

Example:

```text
Source: /api/README.md
Source: /api/accounts/README.md
Source: /api/accounts/create.ts
```

---

# 35. Recommended Function Template

```text
::neup.documentation::function-id
::function functionName(parameterName)
::title Function Title

Short shared description.

::public

Public function documentation.

::param external parameterName
::datatype string
::required true

Public parameter description.

::returns
::datatype ReturnType

Public return description.

::public end

::private

Private implementation documentation.

::param internal localVariable
::datatype string

Internal variable description.

::param injected dependency
::datatype DependencyType

Injected dependency description.

::details

Detailed private implementation notes.

::private end

::end
```

---

# 36. Recommended API Template

```text
::neup.documentation::api-id
::api METHOD /api/path
::title API Title
::authentication bearer

Short shared description.

::public

Public API documentation.

::param parameterName
::location body
::datatype string
::required true

Public parameter description.

::response 200

Successful response description.

::public end

::private

Private implementation documentation.

::param internal normalizedValue
::datatype string

Internal implementation value.

::details

Detailed private API implementation notes.

::private end

::end
```

---

# 37. Recommended Folder README Template

```md
# Folder Name

Short explanation of the folder.

## Shared Rules

Rules that apply to files and subfolders.

::neup.documentation::folder-documentation-id
::title Folder Documentation

Shared folder-level documentation.

::public

Information that may appear in public documentation.

::public end

::private

Private architecture and implementation information.

::private end

::end
```

---

# 38. Short Function Template

```text
::neup.documentation::function-id
::function functionName()

Short explanation of the function.

::param external parameterName

Short explanation of the parameter.

::end
```

---

# 39. Short API Template

```text
::neup.documentation::api-id
::api METHOD /api/path

Short explanation of the API.

::param parameterName

Short explanation of the parameter.

::details

Detailed API documentation.

::end
```

---

# 40. Standard Project Structure

```text
project/
├── README.md
├── docs/
│   ├── architecture.md
│   ├── deployment.md
│   └── conventions.md
├── api/
│   ├── README.md
│   ├── accounts/
│   │   ├── README.md
│   │   ├── create.ts
│   │   └── update.ts
│   └── users/
│       ├── README.md
│       └── profile.ts
├── src/
│   ├── README.md
│   ├── components/
│   │   └── README.md
│   └── services/
│       └── README.md
└── tests/
    └── README.md
```

---

# 41. Core Principles

The standard follows these principles:

* Documentation stays close to the code or folder it describes.
* Developers may document code without modifying source files.
* Parameter scope describes code accessibility, not documentation visibility.
* Public and private content may coexist in one block.
* Public and private sections should be explicitly closed.
* Implicit section closing is accepted with a warning.
* Folder `README.md` files provide shared documentation.
* Unknown fields remain extensible.
* Markdown remains human-readable.
* The format remains machine-parseable.
* Private content never reaches public documentation builds.


# 42. Semantic Documentation Links

Documentation links in a `README.md` must use a meaningful title based on what the documented code does.

The visible link text must not normally be based only on:

* The source filename
* The source extension
* The final folder name
* The raw documentation ID

For example, when account-creation documentation exists in:

```text
/bridge/api.v1/account/create.php
```

the related `README.md` should link to it as:

```md
- [Account Creation](./create.php)
```

It should not normally be written as:

```md
- [create.php](./create.php)
```

The link destination identifies the file, while the link label explains the documented behavior.

---

## 42.1 Link Title Resolution

The documentation application should determine the visible link title using the following priority:

1. Explicit `::title`
2. API purpose inferred from `::api`
3. Function purpose inferred from `::function`
4. Documentation block ID
5. Source filename as a final fallback

Example documentation:

```php
/*
::neup.documentation::create-account
::title Account Creation
::api POST /api/v1/accounts

Creates a new account.

::end
*/
```

Generated README link:

```md
- [Account Creation](./create.php)
```

---

## 42.2 Explicit Title

The recommended way to control the visible documentation link is:

```text
::title Account Creation
```

Example:

```php
/*
::neup.documentation::create-account
::title Account Creation
::api POST /api/v1/accounts

Creates a new account.

::end
*/
```

The generated link must be:

```md
[Account Creation](./create.php)
```

The title should describe the purpose of the code rather than repeat its filename.

Good titles:

```text
Account Creation
Account Retrieval
Account Update
Account Deletion
User Authentication
File Upload
Upload Token Generation
Message Delivery
```

Avoid titles such as:

```text
create.php
create
account/create
Create File
API File
```

---

## 42.3 Title Inference from an API

When `::title` is not provided, the application may generate a title from the API operation.

Example:

```text
::neup.documentation::create-account
::api POST /api/v1/accounts
```

Generated title:

```text
Account Creation
```

Another example:

```text
::neup.documentation::get-account
::api GET /api/v1/accounts/{accountId}
```

Generated title:

```text
Account Retrieval
```

Recommended HTTP-method inference:

| API operation                  | Suggested documentation title |
| ------------------------------ | ----------------------------- |
| `POST /accounts`               | Account Creation              |
| `GET /accounts`                | Account Listing               |
| `GET /accounts/{accountId}`    | Account Retrieval             |
| `PUT /accounts/{accountId}`    | Account Replacement           |
| `PATCH /accounts/{accountId}`  | Account Update                |
| `DELETE /accounts/{accountId}` | Account Deletion              |

The generated title should describe the operation and resource, not display the raw route.

---

## 42.4 Title Inference from a Function

When documentation describes a function and does not contain `::title`, the application may infer a readable title from `::function`.

Example:

```text
::neup.documentation::create-account
::function createAccount()
```

Generated title:

```text
Account Creation
```

Example:

```text
::function getAccountById(accountId)
```

Generated title:

```text
Get Account by ID
```

Example:

```text
::function generateUploadToken(fileId)
```

Generated title:

```text
Generate Upload Token
```

The application may convert function names from:

```text
camelCase
PascalCase
snake_case
kebab-case
```

into readable titles.

However, when a more professional noun-based title is available, it may prefer:

```text
Account Creation
```

over:

```text
Create Account
```

An explicitly defined `::title` always takes priority over inferred titles.

---

## 42.5 Documentation ID Fallback

When neither `::title`, `::api`, nor `::function` is available, the application may derive the title from the documentation ID.

Example:

```text
::neup.documentation::account-creation
```

Generated title:

```text
Account Creation
```

The documentation ID remains the stable machine identifier.

The title is the human-readable display name.

They serve different purposes:

```text
ID: create-account
Title: Account Creation
```

---

## 42.6 README Chapter Generation

A folder-level `README.md` may contain a chapter listing the documented functions, APIs, classes, or modules found inside that folder.

Example project structure:

```text
bridge/
└── api.v1/
    └── account/
        ├── README.md
        ├── create.php
        ├── get.php
        ├── update.php
        └── delete.php
```

Generated `/bridge/api.v1/account/README.md`:

```md
# Account API

Documentation for account-related API operations.

## Account Operations

- [Account Creation](./create.php)
- [Account Retrieval](./get.php)
- [Account Update](./update.php)
- [Account Deletion](./delete.php)
```

The visible titles describe the operations.

The links point to the files where the documentation blocks are stored.

---

## 42.7 Linking to Source Files

When documentation is written inside a source file, the README link should point to that source file.

Example:

```md
[Account Creation](./create.php)
```

From another folder, the correct relative source path should be used:

```md
[Account Creation](../bridge/api.v1/account/create.php)
```

From the root `README.md`:

```md
[Account Creation](./bridge/api.v1/account/create.php)
```

The generator must calculate the relative path from the README containing the link.

---

## 42.8 Linking to Markdown Documentation

When the documentation is stored in a dedicated Markdown file, the link should point to that Markdown file instead.

Example structure:

```text
bridge/
└── api.v1/
    └── account/
        ├── README.md
        ├── create.php
        └── create-account.md
```

README link:

```md
- [Account Creation](./create-account.md)
```

When both inline source documentation and a dedicated Markdown page exist, the documentation configuration should determine the preferred target.

Recommended default priority:

1. Dedicated documentation page
2. Folder README anchor
3. Source file containing the documentation block

---

## 42.9 Multiple Documentation Blocks in One File

A source file may contain multiple documentation blocks.

Example:

```text
/bridge/api.v1/account/account.php
```

contains:

```text
::neup.documentation::create-account
::title Account Creation
::api POST /api/v1/accounts
...
::end

::neup.documentation::get-account
::title Account Retrieval
::api GET /api/v1/accounts/{accountId}
...
::end
```

The README should link to the relevant documentation entry using an anchor when supported:

```md
- [Account Creation](./account.php#account-creation)
- [Account Retrieval](./account.php#account-retrieval)
```

The generated anchor should normally be derived from `::title`:

```text
Account Creation
→ account-creation
```

If source-code viewers do not support generated documentation anchors, the documentation platform should link to its own rendered documentation page instead.

---

## 42.10 Generated Documentation Page Links

For generated web documentation, every documentation block should receive its own canonical route.

Example source:

```text
/bridge/api.v1/account/create.php
```

Example generated route:

```text
/docs/api-v1/account/account-creation
```

README generated for the documentation website:

```md
- [Account Creation](/docs/api-v1/account/account-creation)
```

Repository README generated for source navigation:

```md
- [Account Creation](./create.php)
```

The generator may therefore support two link modes:

```text
source
documentation
```

Example configuration:

```text
::link-mode source
```

or:

```text
::link-mode documentation
```

Recommended behavior:

* Repository README files use source links.
* Documentation websites use generated documentation routes.

---

## 42.11 Link Metadata

A documentation block may explicitly define its link label and preferred path.

```text
::title Account Creation
::link-title Account Creation
::link-target ./create.php
```

Normally, `::link-title` is unnecessary because `::title` should be used.

`::link-target` should only be used when the automatic destination is incorrect or when the documentation should point to another page.

Example:

```text
::neup.documentation::create-account
::title Account Creation
::api POST /api/v1/accounts
::link-target ./README.md#account-creation
```

The parser should treat these as optional custom fields.

---

## 42.12 Recommended Source Example

File:

```text
/bridge/api.v1/account/create.php
```

Content:

```php
<?php

/*
::neup.documentation::create-account
::title Account Creation
::api POST /api/v1/accounts
::authentication bearer

::public

Creates a new account for the authenticated user.

::param name
::location body
::datatype string
::required true

The name of the new account.

::public end

::private

The endpoint validates the request and passes the normalized values to
`createAccount()`.

The account and ownership records are created inside one database transaction.

::private end

::end
*/

function createAccount(array $request): array
{
    // Implementation
}
```

Generated account README chapter:

```md
## Account Operations

- [Account Creation](./create.php)
```

The displayed text is based on:

```text
::title Account Creation
```

The actual destination is:

```text
/bridge/api.v1/account/create.php
```

---

## 42.13 Automated README Entry Rules

When generating or updating a README chapter, the documentation application should:

1. Find documentation blocks belonging to the folder.
2. Read each block's semantic title.
3. Determine the correct source or documentation target.
4. Generate a relative Markdown link.
5. Group entries by documentation type or resource.
6. Sort entries using configured ordering.
7. Preserve manually written README content.
8. Update only the managed documentation chapter.

Example managed section:

```md
<!-- ::neup.documentation.index start -->

## Account Operations

- [Account Creation](./create.php)
- [Account Retrieval](./get.php)
- [Account Update](./update.php)
- [Account Deletion](./delete.php)

<!-- ::neup.documentation.index end -->
```

The application may replace content only between:

```text
<!-- ::neup.documentation.index start -->
```

and:

```text
<!-- ::neup.documentation.index end -->
```

Everything outside these markers must remain unchanged.

---

## 42.14 Chapter Grouping

Documentation links should be grouped by their actual purpose.

Examples:

```md
## Account APIs

- [Account Creation](./create.php)
- [Account Retrieval](./get.php)

## Account Functions

- [Account Validation](./validate.php)
- [Account Name Normalization](./normalize.php)

## Shared Account Documentation

- [Account Authentication Rules](./README.md#authentication)
- [Account Error Responses](./README.md#error-responses)
```

The chapter title may be inferred from:

* `::api`
* `::function`
* `::type`
* Folder context
* Explicit grouping metadata

Optional grouping field:

```text
::group Account Operations
```

Example:

```text
::neup.documentation::create-account
::title Account Creation
::group Account Operations
::api POST /api/v1/accounts
```

---

## 42.15 Final Link Rule

The required link format is:

```md
[Meaningful Documentation Title](relative-or-generated-target)
```

For the account-creation example:

```md
[Account Creation](./create.php)
```

Not:

```md
[create.php](./create.php)
```

The filename identifies where the documentation is stored.

The title tells the reader what the documentation is about.
