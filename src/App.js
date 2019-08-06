import React from 'react';

import AppBar from '@material-ui/core/AppBar';
import Button from '@material-ui/core/Button';
import CodeIcon from '@material-ui/icons/Code';
import Container from '@material-ui/core/Container';
import CssBaseline from '@material-ui/core/CssBaseline';
import Divider from '@material-ui/core/Divider';
import Drawer from '@material-ui/core/Drawer';
import EmailIcon from '@material-ui/icons/Email';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import Link from '@material-ui/core/Link';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import MenuIcon from '@material-ui/icons/Menu';
import MusicIcon from '@material-ui/icons/MusicNote';
import Toolbar from '@material-ui/core/Toolbar';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';

import bpmClassicImage from './images/bpm-classic.png';
import jrpgImage from './images/jrpg.jpg';
import partyGifImage from './images/partygif.jpg';
import signDoctorImage from './images/sign-doctor.jpg';
import spriteSheetSlicerImage from './images/sprite-sheet-slicer.jpg';

import ProjectCard from './ProjectCard';

const styles = theme => ({
  icon: {
    marginRight: theme.spacing(2),
  },
  heroContent: {
    backgroundColor: theme.palette.background.paper,
    padding: theme.spacing(8, 0, 6),
  },
  heroButtons: {
    marginTop: theme.spacing(4),
  },
  cardGrid: {
    paddingTop: theme.spacing(8),
    paddingBottom: theme.spacing(8),
    maxWidth: '95%'
  },
  drawer: {
    width: 240,
    flexShrink: 0
  },
  drawerPaper: {
    width: 240
  },
  footer: {
    backgroundColor: theme.palette.background.paper,
    padding: theme.spacing(6),
  },
});

class MenuLinkButton extends React.Component {
  render() {
    return (
      <Link underline='none' color='inherit' href={this.props.href} target="_blank">
        <ListItem button>
          <ListItemIcon>{this.props.icon}</ListItemIcon>
          <ListItemText primary={this.props.text} />
        </ListItem>
      </Link>
    );
  }
}

class App extends React.Component {
  state = {
    drawerOpen: false
  }

  render() {
    const {classes} = this.props;

    return (
      <React.Fragment>
        <CssBaseline />
        <AppBar position="relative">
          <Toolbar>
            <IconButton edge="start" color="inherit" aria-label="menu" onClick={_ => this.setState({drawerOpen: true})}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" color="inherit" noWrap>
              About Me
            </Typography>
          </Toolbar>
        </AppBar>
        <Drawer className={classes.drawer} open={this.state.drawerOpen} onClose={_ => this.setState({drawerOpen: false})}
        classes={{
          paper: classes.drawerPaper,
        }}
        >
          <List>
            <ListItem>
              <Typography variant="h6">Parker Miller</Typography>
            </ListItem>
            <Divider />
            <MenuLinkButton
              href="mailto: parkermiller00@gmail.com"
              icon={<EmailIcon />}
              text={"Email"}
            />
            <MenuLinkButton
              href="https://github.com/parkm"
              icon={<CodeIcon />}
              text={"GitHub"}
            />
            <MenuLinkButton
              href="https://soundcloud.com/fofx_music"
              icon={<MusicIcon />}
              text={"Music"}
            />
          </List>
        </Drawer>
        <main>
          <div className={classes.heroContent}>
            <Container maxWidth="md">
              <Typography component="h1" variant="h2" align="center" color="textPrimary" gutterBottom>
                Parker Miller
              </Typography>
              <Typography variant="h5" align="center" color="textSecondary" paragraph>
                I'm a software engineer currently working at Instructure!
                <br/>
                I dabble in music production and game development.
              </Typography>
              <div className={classes.heroButtons}>
                <Grid container spacing={2} justify="center">
                  <Grid item>
                    <Button variant="outlined" color="primary" href="https://github.com/parkm" target="_blank">
                      <img alt="GitHub" width="64px" src="https://github.githubassets.com/images/modules/logos_page/GitHub-Logo.png"></img>
                    </Button>
                  </Grid>
                </Grid>
              </div>
            </Container>
          </div>
          <Container className={classes.cardGrid} maxWidth="md">
            <Grid container spacing={4}>
              <ProjectCard
                image="https://www.mapeditor.org/img/tiled-logo-white.png"
                imageTitle="Tiled"
                header="Tiled"
                viewHref="https://github.com/parkm/tiled/commits/master"
              >
                {"I've made contributions to Tiled, a popular map editor. I added multiple property editing. Which has saved me tons of time in my Tiled workflow."}
              </ProjectCard>
              <ProjectCard
                image={jrpgImage}
                imageTitle="JRPG Demo"
                header="JRPG"
                viewHref="unity/jrpg"
              >

                {"A jrpg demo made with Unity. I made this to learn more about the Unity workflow. Currently the UI is a little buggy with WebGL."}
              </ProjectCard>
              <ProjectCard
                image={bpmClassicImage}
                imageTitle="BPM Classic Demo"
                header="BPM Classic"
                viewHref="unity/bpm_classic"
              >
                {"Bubble Pop Mania was"} <Link href="https://www.newgrounds.com/portal/view/596665" target="_blank">{"an old flash game I made for Newgrounds."}</Link> {"This is a remake made with Unity."}
              </ProjectCard>
              <ProjectCard
                image={signDoctorImage}
                imageTitle="Minecraft Sign"
                header="SignDoctor"
                viewHref="https://github.com/parkm/SignDoctor"
              >
                {"A Minecraft Bukkit plugin that offers sign editing utilities. Made with Java."}
              </ProjectCard>
              <ProjectCard
                image={spriteSheetSlicerImage}
                imageTitle="Sprite Sheet Slicer App"
                header="Sprite Sheet Slicer"
                viewHref="https://github.com/parkm/sprite-sheet-slicer"
              >

                {"An app made with Python that automatically slices sprites. Slices can be exported as JSON. This functionality is built into Unity now, so not much use for this in my personal projects. However I learned a lot with this project, and it was fun to make."}
              </ProjectCard>
              <ProjectCard
                image={partyGifImage}
                imageTitle="Partygif App"
                header="Party GIF"
                viewHref="https://github.com/parkm/partygif"
              >
                Turns any image into a party gif. Can be customized to create any other type of colorful gif. Great for Slack emojis!
              </ProjectCard>
            </Grid>
          </Container>
        </main>
        <footer className={classes.footer}>
          <Typography variant="subtitle1" align="center" color="textSecondary" component="p">
            {"Design based on the "}
            <Link href="https://github.com/mui-org/material-ui/tree/master/docs/src/pages/getting-started/templates/album">
               material-ui album template
            </Link>
          </Typography>
        </footer>
      </React.Fragment>
    );
  }
}

export default withStyles(styles)(App);
