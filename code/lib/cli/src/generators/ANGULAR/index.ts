import { join } from 'path';
import semver from 'semver';
import { baseGenerator } from '../baseGenerator';
import type { Generator } from '../types';
import { CoreBuilder } from '../../project_types';
import { AngularJSON, compoDocPreviewPrefix, promptForCompoDocs } from './helpers';
import { getCliDir } from '../../dirs';
import { paddedLog, copyTemplate } from '../../helpers';

const generator: Generator<{ projectName: string }> = async (
  packageManager,
  npmOptions,
  options,
  commandOptions
) => {
  const angularVersionFromDependencies = semver.coerce(
    (await packageManager.retrievePackageJson()).dependencies['@angular/core']
  )?.version;

  const angularVersionFromDevDependencies = semver.coerce(
    (await packageManager.retrievePackageJson()).devDependencies['@angular/core']
  )?.version;

  const angularVersion = angularVersionFromDependencies || angularVersionFromDevDependencies;
  const isWebpack5 = semver.gte(angularVersion, '12.0.0');
  const updatedOptions = isWebpack5 ? { ...options, builder: CoreBuilder.Webpack5 } : options;

  const angularJSON = new AngularJSON();

  if (
    !angularJSON.projects ||
    (angularJSON.projects && Object.keys(angularJSON.projects).length === 0)
  ) {
    throw new Error(
      'Storybook was not able to find any projects in your angular.json file. Are you sure this is an Angular CLI project?'
    );
  }

  if (angularJSON.projectsWithoutStorybook.length === 0) {
    throw new Error(
      'Every project in your workspace is already set up with Storybook. There is nothing to do!'
    );
  }

  const angularProjectName = await angularJSON.getProjectName();
  paddedLog(`Adding Storybook support to your "${angularProjectName}" project`);

  const angularProject = angularJSON.getProjectSettingsByName(angularProjectName);

  if (!angularProject) {
    throw new Error(
      `Somehow we were not able to retrieve the "${angularProjectName}" project in your angular.json file. This is likely a bug in Storybook, please file an issue.`
    );
  }

  const { root, projectType } = angularProject;
  const { projects } = angularJSON;
  const compodocVersion = commandOptions.yes ? '1.1.19' : await promptForCompoDocs();
  const storybookFolder = root ? `${root}/.storybook` : '.storybook';

  angularJSON.addStorybookEntries({
    angularProjectName,
    storybookFolder,
    useCompodoc: compodocVersion !== null,
    root,
  });
  angularJSON.write();

  await baseGenerator(
    packageManager,
    npmOptions,
    {
      ...updatedOptions,
      ...(compodocVersion && {
        frameworkPreviewParts: {
          prefix: compoDocPreviewPrefix,
        },
      }),
    },
    'angular',
    {
      ...(compodocVersion && { extraPackages: [`@compodoc/compodoc@${compodocVersion}`] }),
      addScripts: false,
      componentsDestinationPath: root ? `${root}/src/stories` : undefined,
      storybookConfigFolder: storybookFolder,
    },
    'angular'
  );

  if (Object.keys(projects).length === 1) {
    packageManager.addScripts({
      storybook: `ng run ${angularProjectName}:storybook`,
      'build-storybook': `ng run ${angularProjectName}:build-storybook`,
    });
  }

  let projectTypeValue = projectType || 'application';
  if (projectTypeValue !== 'application' && projectTypeValue !== 'library') {
    projectTypeValue = 'application';
  }

  const templateDir = join(getCliDir(), 'templates', 'angular', projectTypeValue);
  if (templateDir) {
    copyTemplate(templateDir, root || undefined);
  }

  return {
    projectName: angularProjectName,
    configDir: storybookFolder,
  };
};

export default generator;
