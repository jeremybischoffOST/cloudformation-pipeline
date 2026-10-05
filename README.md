# CI/CD Pipeline for a CloudFormation Stack using GitHub Actions

This exercise builds on the live voting app from the [CloudFormation exercise](https://gitlab.com/fritsche-ost/cloudformation-stack).
Instead of creating the stack by hand, a GitHub Actions pipeline builds, tests and deploys the application on every push.

## Project Structure

- `template.yaml`: CloudFormation template (DynamoDB table, Lambda function with function URL)
- `src/index.mjs`: Node.js code of the Lambda function
- `test/index.test.mjs`: unit tests, DynamoDB is mocked
- `.github/workflows/pipeline.yml`: the pipeline

## The Pipeline

| Stage | What happens | When |
|---|---|---|
| **build** | install dependencies, lint the CloudFormation template, zip `src/` into `function.zip` and store it as a workflow artifact | every push and pull request |
| **test** | run the unit tests | every push and pull request |
| **deploy** | upload `function.zip` to S3, deploy the stack with `aws cloudformation deploy`, smoke test the URL | pushes to `main` only |

Each commit uploads its ZIP file under its own name (`voting/function-<commit>.zip`).
The changed `CodeKey` parameter tells CloudFormation that the code has changed, so it updates the Lambda function.

## Run Locally

```sh
npm install
npm test        # unit tests
npm run build   # creates dist/function.zip
```

## Set Up the Pipeline

### 1. Import the Repository into GitHub

The pipeline runs on GitHub Actions, so you need your own copy of this repository on GitHub.

1. Sign in to [GitHub](https://github.com).
2. Click on the "+" button in the upper right corner and select "Import repository".
3. Enter the URL of this repository as "Your source repository details":
   `https://gitlab.com/fritsche-ost/cloudformation-pipeline.git`
4. Leave the credentials empty, as the source repository is public.
5. Choose yourself as "Owner" and enter a "Repository name", e.g. `cloudformation-pipeline`.
6. Click on "Begin import" and wait until the import has finished.
7. Clone your new repository to your computer:

   ```sh
   git clone https://github.com/<your-user>/cloudformation-pipeline.git
   ```

The workflow in `.github/workflows/pipeline.yml` is imported together with the code and is active immediately.

### 2. Store the AWS Credentials as Secrets

The AWS Academy Learner Lab does not allow creating IAM users or roles, so the pipeline uses the temporary credentials of your lab session.

1. Start the lab in AWS Academy and click on "AWS Details".
2. Next to "AWS CLI" click on "Show".
3. In your GitHub repository open "Settings" → "Secrets and variables" → "Actions" and create three repository secrets with the values shown:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_SESSION_TOKEN`

The credentials expire when the lab session ends. After starting a new session, update the three secrets.

### 3. Run the Pipeline

Push a commit to `main` or start the workflow manually under "Actions" → "Pipeline" → "Run workflow".
When the pipeline has finished, the URL of the voting app is shown in the summary of the workflow run.

### 4. Make a Change

1. Change the `QUESTION` (and if you like the `OPTIONS`) of the Lambda function in `template.yaml`.
2. Commit and push the change:

   ```sh
   git commit -am "Change voting question"
   git push
   ```

3. Follow the pipeline under "Actions" and reload the voting page when it has finished.

## Clean Up

Delete the stack and the artifact bucket:

```sh
aws cloudformation delete-stack --stack-name voting
BUCKET=voting-artifacts-$(aws sts get-caller-identity --query Account --output text)
aws s3 rb s3://$BUCKET --force
```
